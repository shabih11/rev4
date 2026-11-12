begin;
-- Scheduled display presence is separate from real account heartbeats and auth logs.
create table private.owner_presence_settings (
 id integer primary key check(id=1),
 profile_id text references public.profiles(id),
 enabled boolean not null default false,
 activated_at timestamptz not null default now()
);
create table private.owner_presence_weeks (week date primary key);
create table private.owner_presence_sessions (
 starts_at timestamptz primary key,
 ends_at timestamptz not null,
 check(ends_at-starts_at in (interval '10 minutes',interval '30 minutes',interval '60 minutes')),
 check((starts_at at time zone 'Asia/Riyadh')::time>=time '09:00' or (starts_at at time zone 'Asia/Riyadh')::time<time '01:00'),
 check(ends_at<=((case when (starts_at at time zone 'Asia/Riyadh')::time<time '01:00' then (starts_at at time zone 'Asia/Riyadh')::date else (starts_at at time zone 'Asia/Riyadh')::date+1 end)+time '01:00') at time zone 'Asia/Riyadh')
);
alter table private.owner_presence_settings enable row level security;
alter table private.owner_presence_weeks enable row level security;
alter table private.owner_presence_sessions enable row level security;
revoke all on private.owner_presence_settings,private.owner_presence_weeks,private.owner_presence_sessions from public,anon,authenticated;
insert into private.owner_presence_settings(id,profile_id,enabled)
select 1,min(profile_id),count(*)=1 from public.user_access where role='viewer' and not disabled;

create function private.plan_owner_presence_week(requested_week date) returns void
language plpgsql security definer set search_path='' as $$
declare day date; weekday integer; visits integer; slot integer; minutes integer; duration integer;
 long_day integer; long_slot integer; draw double precision; start_at timestamptz; finish_at timestamptz;
begin
 if requested_week is null or requested_week<>date_trunc('week',requested_week)::date then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-presence-plan',0));
 insert into private.owner_presence_weeks values(requested_week) on conflict do nothing;
 if not found then return; end if;
 long_day:=case when random()<0.8 then floor(random()*7)::integer else -1 end;
 for weekday in 0..6 loop
  day:=requested_week+weekday;
  draw:=random();
  visits:=case when draw<0.09 then 0 when draw<0.28 then 1 when draw<0.40 then 2 else 3 end;
  long_slot:=case when weekday=long_day and visits>0 then 1+floor(random()*visits)::integer else 0 end;
  for slot in 1..visits loop
   duration:=case when slot=long_slot then case when random()<0.5 then 30 else 60 end else 10 end;
   if visits=1 then
    minutes:=case when random()<0.8 then 580+floor(random()*720)::integer else 1390+floor(random()*81)::integer end;
   elsif slot=visits then
    minutes:=1380+(array[10,20,30,40,60,90])[1+floor(random()*6)::integer]+floor(random()*7)::integer-3;
   elsif slot=1 then minutes:=580+floor(random()*400)::integer;
   else minutes:=1030+floor(random()*280)::integer;
   end if;
   -- Long late visits finish before the overnight exclusion window.
   if duration>10 and minutes>=1380 then minutes:=1390+floor(random()*26)::integer; end if;
   start_at:=(day::timestamp+make_interval(mins=>minutes)) at time zone 'Asia/Riyadh';
   finish_at:=start_at+make_interval(mins=>duration);
   if (select count(*) from private.owner_presence_sessions s where (s.starts_at at time zone 'Asia/Riyadh')::date=(start_at at time zone 'Asia/Riyadh')::date)>=3 then continue; end if;
   if exists(select 1 from private.owner_presence_sessions s where tstzrange(s.starts_at,s.ends_at+interval '45 minutes','[)') && tstzrange(start_at,finish_at+interval '45 minutes','[)')) then continue; end if;
   insert into private.owner_presence_sessions values(start_at,finish_at);
  end loop;
 end loop;
end $$;
revoke all on function private.plan_owner_presence_week(date) from public,anon,authenticated;

create function private.refresh_owner_presence_plan() returns void
language plpgsql security definer set search_path='' as $$
declare week date:=date_trunc('week',now() at time zone 'Asia/Riyadh')::date;
begin
 if not exists(select 1 from private.owner_presence_settings where id=1 and enabled) then return; end if;
 perform private.plan_owner_presence_week(week);
 perform private.plan_owner_presence_week(week+7);
end $$;
revoke all on function private.refresh_owner_presence_plan() from public,anon,authenticated;

create function public.get_owner_presence_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 return (select jsonb_build_object('enabled',enabled,'available',profile_id is not null) from private.owner_presence_settings where id=1);
end $$;
create function public.set_owner_presence_enabled(requested boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested is null then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-presence-plan',0));
 if not exists(select 1 from private.owner_presence_settings c join public.user_access a on a.profile_id=c.profile_id where c.id=1 and a.role='viewer' and not a.disabled) then raise invalid_parameter_value; end if;
 update private.owner_presence_settings set enabled=requested,activated_at=case when requested and not enabled then now() else activated_at end where id=1;
 perform private.refresh_owner_presence_plan();
end $$;
revoke all on function public.get_owner_presence_settings(),public.set_owner_presence_enabled(boolean) from public,anon;
grant execute on function public.get_owner_presence_settings(),public.set_owner_presence_enabled(boolean) to authenticated;

create or replace function public.get_online_employees() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise insufficient_privilege; end if;
 select coalesce(jsonb_object_agg(id,expires_at),'{}'::jsonb) into result from (
  select id,max(expires_at) as expires_at from (
   select p.id,max(s.last_seen_at)+interval '5 minutes' as expires_at
   from public.profiles p join public.user_access a on a.profile_id=p.id and a.role in ('employee','viewer') and not a.disabled
   join private.employee_page_presence s on s.user_id=a.uid
   where p.data->>'role' in ('employee','viewer') and s.last_seen_at<=now() group by p.id
   union all
   select c.profile_id,case when s.ends_at>now() then least(s.ends_at,now()+interval '30 seconds') else s.ends_at end
   from private.owner_presence_settings c
   join lateral (select starts_at,ends_at from private.owner_presence_sessions where starts_at<=now() and starts_at>=c.activated_at order by starts_at desc limit 1) s on true
   where c.id=1 and c.enabled and exists(select 1 from public.user_access a where a.profile_id=c.profile_id and a.role='viewer' and not a.disabled)
  ) sources group by id order by max(expires_at) desc,id limit 50
 ) recent;
 return result;
end $$;
revoke all on function public.get_online_employees() from public,anon;
grant execute on function public.get_online_employees() to authenticated;
select private.refresh_owner_presence_plan();
select cron.schedule('rev4-owner-presence-plan','17 * * * *','select private.refresh_owner_presence_plan()');
commit;
