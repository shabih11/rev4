begin;
create table public.employee_feature_settings (
 id smallint primary key check(id=1),
 data jsonb not null check(jsonb_typeof(data)='object')
);
insert into public.employee_feature_settings values(1,'{"competition":false,"balanceGrowth":false,"tiers":false,"avatars":false,"silverAt":8,"goldAt":11}');
alter table public.employee_feature_settings enable row level security;
revoke all on public.employee_feature_settings from public,anon,authenticated;
grant select on public.employee_feature_settings to authenticated;
grant all on public.employee_feature_settings to service_role;
create policy feature_settings_read on public.employee_feature_settings for select to authenticated using ((select private.account_role()) is not null);
create trigger feature_version after update on public.employee_feature_settings for each statement execute function private.bump_version();

create table private.employee_daily_baselines(day date primary key, balances jsonb not null);
create table public.employee_accessories (
 profile_id text primary key references public.profiles(id) on delete cascade,
 items text[] not null default '{}' check(cardinality(items)<=3 and items <@ array['shawl','brooch','veil'])
);
alter table public.employee_accessories enable row level security;
revoke all on public.employee_accessories from public,anon,authenticated;
grant select on public.employee_accessories to authenticated;
grant all on public.employee_accessories to service_role;
create policy accessory_read on public.employee_accessories for select to authenticated using ((select private.account_role()) is not null);
create trigger accessory_version after insert or update or delete on public.employee_accessories for each statement execute function private.bump_version();

-- Employees decorate the fixed avatar; they cannot replace its base image through a direct profile write.
create function private.lock_employee_avatar() returns trigger
language plpgsql set search_path='' as $$
begin
 if private.account_role()='employee' and new.data->'imageUrl' is distinct from old.data->'imageUrl' then raise exception 'Base avatar is fixed' using errcode='42501'; end if;
 return new;
end $$;
create trigger fixed_employee_avatar before update on public.profiles for each row execute function private.lock_employee_avatar();
revoke all on function private.lock_employee_avatar() from public,anon,authenticated;

-- Same monthly formula as DataContext. Used only internally for tier authorization and midnight snapshots.
create function private.employee_scores(cutoff timestamptz default now())
returns table(profile_id text,balance numeric,points numeric)
language sql stable security definer set search_path='' as $$
 with period as (select date_trunc('month',cutoff at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh' start_at),
 credits as (
   select member, sum(case when r.rating>=4 then 1.0/cardinality(r.employee_ids) else 0 end) balance,
     sum(case when r.rating>=4 then 0.25/cardinality(r.employee_ids) else 0 end) positive,
     sum(case when r.rating<=2 then 0.5/cardinality(r.employee_ids) else 0 end) negative
   from public.reviews r cross join lateral unnest(r.employee_ids) member cross join period
   where r.occurred_at>=period.start_at and r.occurred_at<cutoff group by member
 ), penalties as (
   select member, sum(case when t.data->>'title' like '%شكوى%' then 1 else 0 end) complaints,
     sum(case when t.data->>'title' like '%سلامة%' then 1 else 0 end) safety
   from public.timeline_events t cross join lateral unnest(t.employee_ids) member cross join period
   where t.kind='gap' and t.occurred_at>=period.start_at and t.occurred_at<cutoff group by member
 )
 select p.id, round(coalesce(c.balance,0)+coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0),1),
   least(5,coalesce(c.positive,0)+coalesce((p.data#>>'{manualStats,positive}')::numeric,0))+
   greatest(0,2-coalesce(c.negative,0)+coalesce((p.data#>>'{manualStats,negative}')::numeric,0))+
   greatest(0,4-coalesce(n.complaints,0)-coalesce(n.safety,0)-coalesce((p.data#>>'{manualStats,complaints}')::numeric,0)-coalesce((p.data#>>'{manualStats,safety}')::numeric,0))
 from public.profiles p left join credits c on c.member=p.id left join penalties n on n.member=p.id where p.data->>'role'='employee';
$$;
create function private.capture_employee_baseline() returns void
language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date;
begin
 -- Never overwrite a captured baseline or pretend a late capture happened at midnight.
 if (now() at time zone 'Asia/Riyadh')::time > time '00:02' then return; end if;
 insert into private.employee_daily_baselines(day,balances)
 select today,coalesce(jsonb_object_agg(profile_id,balance),'{}')
 from private.employee_scores(today::timestamp at time zone 'Asia/Riyadh')
 on conflict(day) do nothing;
 delete from private.employee_daily_baselines where day<today-40;
 update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
end $$;
create function public.get_employee_features() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 select jsonb_build_object('settings',s.data,'baselineDay',b.day,'baseline',coalesce(b.balances,'{}'),
   'accessories',(select coalesce(jsonb_object_agg(profile_id,items),'{}') from public.employee_accessories))
 into result from public.employee_feature_settings s left join private.employee_daily_baselines b on b.day=(now() at time zone 'Asia/Riyadh')::date where s.id=1;
 return result;
end $$;
create function public.save_employee_features(requested jsonb,expected jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actual jsonb;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested is null or jsonb_typeof(requested)<>'object' or
   not requested ?& array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt'] or
   requested-array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt']<>'{}' or
   jsonb_typeof(requested->'silverAt')<>'number' or jsonb_typeof(requested->'goldAt')<>'number' or
   exists(select 1 from unnest(array['competition','balanceGrowth','tiers','avatars']) k where jsonb_typeof(requested->k)<>'boolean') then raise exception 'Invalid feature settings' using errcode='22023'; end if;
 if (requested->>'silverAt')::numeric<=0 or (requested->>'goldAt')::numeric<=(requested->>'silverAt')::numeric or (requested->>'goldAt')::numeric>11 then raise exception 'Invalid thresholds' using errcode='22023'; end if;
 select data into actual from public.employee_feature_settings where id=1 for update;
 if actual is distinct from expected then raise exception 'write-conflict' using errcode='40001'; end if;
 update public.employee_feature_settings set data=requested where id=1;
end $$;
create function public.save_my_accessories(requested text[]) returns void
language plpgsql security definer set search_path='' as $$
declare settings jsonb; score numeric; allowed text[] := '{}'; profile text := private.account_profile();
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 select data into settings from public.employee_feature_settings where id=1 for share;
 if not (settings->>'avatars')::boolean or not (settings->>'tiers')::boolean then raise exception 'Feature disabled' using errcode='42501'; end if;
 select points into score from private.employee_scores() where profile_id=profile;
 if score>=(settings->>'goldAt')::numeric then allowed:=array['shawl','brooch','veil'];
 elsif score>=(settings->>'silverAt')::numeric then allowed:=array['shawl','brooch']; end if;
 if requested is null or cardinality(requested)>3 or array_position(requested,null) is not null or not requested<@allowed or cardinality(requested)<>(select count(distinct x) from unnest(requested) x) then raise exception 'Accessory locked' using errcode='42501'; end if;
 insert into public.employee_accessories(profile_id,items) values(profile,requested) on conflict(profile_id) do update set items=excluded.items;
end $$;

-- Only validated callers can resolve an employee Auth ID. No private account email is returned.
create table private.employee_account_actions(actor uuid not null, target text not null, created_at timestamptz not null default now());
create index employee_account_actions_actor_time on private.employee_account_actions(actor,created_at);
create function public.authorize_employee_account(target_profile text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; actor_role text := private.account_role();
begin
 if auth.uid() is null or actor_role is null or actor_role not in ('admin','manager') then raise exception 'Manager required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('employee-account:'||auth.uid()::text,0));
 if (select count(*) from private.employee_account_actions where actor=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Too many requests' using errcode='42501'; end if;
 select a.uid into result from public.user_access a join public.profiles p on p.id=a.profile_id
 where p.id=target_profile and p.data->>'role'='employee' and a.role='employee' and not a.disabled
 and (actor_role='admin' or (p.branch=private.account_branch() and a.branch=private.account_branch()));
 if result is null then raise exception 'Employee account unavailable' using errcode='42501'; end if;
 insert into private.employee_account_actions(actor,target) values(auth.uid(),target_profile);
 delete from private.employee_account_actions where created_at<now()-interval '30 days';
 return result;
end $$;
-- The default is configured separately in Vault. It is never shipped to the client or migration history.
create function public.employee_default_password() returns text
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='employee_default_password';
 return secret;
end $$;
create function public.finish_employee_account_change(target_uid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if not exists(select 1 from public.user_access where uid=target_uid and role='employee') then raise exception 'Employee required'; end if;
 delete from auth.sessions where user_id=target_uid;
 delete from auth.refresh_tokens where user_id=target_uid::text;
 update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
end $$;
revoke all on private.employee_daily_baselines,private.employee_account_actions from public,anon,authenticated;
revoke all on function private.employee_scores(timestamptz),private.capture_employee_baseline() from public,anon,authenticated;
revoke all on function public.get_employee_features(),public.save_employee_features(jsonb,jsonb),public.save_my_accessories(text[]),public.authorize_employee_account(text),public.employee_default_password(),public.finish_employee_account_change(uuid) from public,anon,authenticated;
grant execute on function public.get_employee_features(),public.save_employee_features(jsonb,jsonb),public.save_my_accessories(text[]),public.authorize_employee_account(text) to authenticated;
grant execute on function public.employee_default_password(),public.finish_employee_account_change(uuid) to service_role;
create extension if not exists pg_cron;
select cron.schedule('employee-midnight-baseline','0 21 * * *','select private.capture_employee_baseline()');
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
