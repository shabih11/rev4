begin;
-- Ownership is permanent; activation and consumable privileges belong to a Riyadh month.
create table private.avatar_privilege_uses (
 id bigint generated always as identity primary key,
 period date not null check(period=date_trunc('month',period)::date),
 actor text not null references public.profiles(id),
 kind text not null check(kind in ('erase','complete')),
 review_id text,
 recipients text[] not null check(cardinality(recipients)>0),
 gold boolean not null,
 target_points numeric,
 used_at timestamptz not null default clock_timestamp(),
 unique(period,actor,kind),
 check((kind='erase' and review_id is not null and target_points is null)
   or (kind='complete' and review_id is null and target_points in (8,11)))
);
create table private.avatar_sea_returns (
 campaign date not null default date '2026-11-01' check(campaign=date '2026-11-01'),
 branch text not null,
 day integer not null check(day between 5 and 30),
 actor text not null references public.profiles(id),
 used_at timestamptz not null default clock_timestamp(),
 primary key(campaign,branch)
);
create table private.reward_month_closures (
 period date primary key check(period=date_trunc('month',period)::date),
 closed_by text not null references public.profiles(id),
 closed_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null,
 avatars jsonb not null
);
alter table private.avatar_privilege_uses enable row level security;
alter table private.avatar_sea_returns enable row level security;
alter table private.reward_month_closures enable row level security;
revoke all on private.avatar_privilege_uses,private.avatar_sea_returns,private.reward_month_closures from public,anon,authenticated;
create trigger avatar_privilege_version after insert on private.avatar_privilege_uses for each statement execute function private.bump_version();
create trigger avatar_sea_return_version after insert on private.avatar_sea_returns for each statement execute function private.bump_version();
create trigger reward_closure_version after insert on private.reward_month_closures for each statement execute function private.bump_version();

create function private.avatar_month_active(profile text, period date, cutoff timestamptz default now()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.avatar_purchases p where p.profile_id=profile
 and p.purchased_at>=period::timestamp at time zone 'Asia/Riyadh'
 and p.purchased_at<(period+interval '1 month') at time zone 'Asia/Riyadh' and p.purchased_at<=cutoff);
$$;
revoke all on function private.avatar_month_active(text,date,timestamptz) from public,anon,authenticated;

-- Scores use original records plus a separately audited waiver; no review is deleted.
alter function private.employee_scores(timestamptz) rename to employee_scores_before_avatar_privileges;
create function private.avatar_month_scores(period date, cutoff timestamptz) returns table(profile_id text,balance numeric,points numeric)
language sql stable security definer set search_path='' as $$
 with credits as (
 select member,sum(case when r.rating>=4 then 1.0/cardinality(r.employee_ids) else 0 end) balance,
 sum(case when r.rating>=4 then 0.25/cardinality(r.employee_ids) else 0 end) positive,
 sum(case when r.rating<=2 and not exists(select 1 from private.avatar_privilege_uses u
   where u.period=avatar_month_scores.period and u.kind='erase' and u.review_id=r.id and member=any(u.recipients))
 then 0.5/cardinality(r.employee_ids) else 0 end) negative
 from public.reviews r cross join lateral unnest(r.employee_ids) member
 where r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh' and r.occurred_at<cutoff group by member
 ), penalties as (
 select member,sum((t.data->>'title' like '%شكوى%')::integer+(t.data->>'title' like '%سلامة%')::integer) total
 from public.timeline_events t cross join lateral unnest(t.employee_ids) member
 where t.kind='gap' and t.occurred_at>=period::timestamp at time zone 'Asia/Riyadh' and t.occurred_at<cutoff group by member
 ), scores as (
 select p.id,round(coalesce(c.balance,0)+coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0),1) balance,
 least(5,coalesce(c.positive,0)+coalesce((p.data#>>'{manualStats,positive}')::numeric,0))+
 least(2,greatest(0,2-coalesce(c.negative,0)+coalesce((p.data#>>'{manualStats,negative}')::numeric,0)
 +greatest(0,coalesce(c.balance,0)+coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0)-20)*0.125))+
 greatest(0,4-coalesce(n.total,0)-coalesce((p.data#>>'{manualStats,complaints}')::numeric,0)-coalesce((p.data#>>'{manualStats,safety}')::numeric,0)) points
 from public.profiles p left join credits c on c.member=p.id left join penalties n on n.member=p.id where p.data->>'role'='employee'
 ) select s.id,s.balance,least(11,greatest(s.points,coalesce((select max(u.target_points) from private.avatar_privilege_uses u
 where u.period=avatar_month_scores.period and u.kind='complete' and s.id=any(u.recipients)
 and u.target_points-s.points between 0 and 0.5),s.points))) from scores s;
$$;
revoke all on function private.avatar_month_scores(date,timestamptz) from public,anon,authenticated;
create function private.employee_scores(cutoff timestamptz default now()) returns table(profile_id text,balance numeric,points numeric)
language sql stable security definer set search_path='' as $$
 select * from private.avatar_month_scores(date_trunc('month',cutoff at time zone 'Asia/Riyadh')::date,cutoff);
$$;
revoke all on function private.employee_scores(timestamptz) from public,anon,authenticated;

create function public.use_avatar_privilege(requested_month date, requested_kind text, requested_target text) returns void
language plpgsql security definer set search_path='' as $$
<<privilege_action>>
declare actor text:=private.account_profile(); actor_branch text; gold boolean; recipients text[]; review public.reviews; score numeric; target numeric; cutoff timestamptz;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if requested_month is null or requested_month<>date_trunc('month',requested_month)::date
 or requested_month>date_trunc('month',now() at time zone 'Asia/Riyadh')::date
 or requested_kind is null or requested_kind not in ('erase','complete') or requested_target is null then raise invalid_parameter_value; end if;
 if not exists(select 1 from public.employee_feature_settings where id=1 and (data->>'avatars')::boolean)
 or not private.avatar_month_active(actor,requested_month)
 or exists(select 1 from private.reward_month_closures where period=requested_month) then raise insufficient_privilege; end if;
 cutoff:=least(now(),(requested_month+interval '1 month') at time zone 'Asia/Riyadh');
 gold:=private.has_gold_avatar_privilege(actor,cutoff-interval '1 microsecond');
 select p.branch into actor_branch from public.profiles p where p.id=actor;
 if requested_kind='erase' then
   select * into review from public.reviews r where r.id=requested_target and r.rating between 1 and 2
    and r.occurred_at>=requested_month::timestamp at time zone 'Asia/Riyadh' and r.occurred_at<cutoff;
   if not found then raise invalid_parameter_value; end if;
   recipients:=case when gold then review.employee_ids else array[actor] end;
   if not gold and not actor=any(review.employee_ids) then raise insufficient_privilege; end if;
   if exists(select 1 from unnest(recipients) id where not exists(select 1 from public.profiles p where p.id=id and p.branch=actor_branch and p.data->>'role'='employee')) then raise insufficient_privilege; end if;
   if exists(select 1 from private.avatar_privilege_uses u where u.period=requested_month and u.kind='erase'
     and u.review_id=review.id and u.recipients&&privilege_action.recipients) then raise exception 'Already waived' using errcode='23505'; end if;
 else
   if not gold and requested_target<>actor then raise insufficient_privilege; end if;
   if not exists(select 1 from public.profiles p where p.id=requested_target and p.branch=actor_branch and p.data->>'role'='employee') then raise insufficient_privilege; end if;
   select s.points into score from private.avatar_month_scores(requested_month,cutoff) s where s.profile_id=requested_target;
   target:=case when score<8 then 8 else 11 end;
   -- A deficit <= .20 is the general rounding system's responsibility when enabled.
   if score is null or target-score<=0 or target-score>0.5
    or (target-score<=0.20 and exists(select 1 from public.employee_feature_settings where id=1 and (data->>'rounding')::boolean)) then raise invalid_parameter_value; end if;
   recipients:=array[requested_target];
 end if;
 insert into private.avatar_privilege_uses(period,actor,kind,review_id,recipients,gold,target_points)
 values(requested_month,actor,requested_kind,case when requested_kind='erase' then requested_target end,recipients,gold,target);
end $$;
revoke all on function public.use_avatar_privilege(date,text,text) from public,anon;
grant execute on function public.use_avatar_privilege(date,text,text) to authenticated;

-- Preserve old selections, but refuse equipping them before this month's purchase.
alter function public.equip_avatar(uuid) rename to equip_avatar_before_month_activation;
revoke all on function public.equip_avatar_before_month_activation(uuid) from public,anon,authenticated;
create function public.equip_avatar(variant uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if variant is not null and not private.avatar_month_active(private.account_profile(),date_trunc('month',now() at time zone 'Asia/Riyadh')::date) then raise insufficient_privilege; end if;
 perform public.equip_avatar_before_month_activation(variant);
end $$;
revoke all on function public.equip_avatar(uuid) from public,anon;
grant execute on function public.equip_avatar(uuid) to authenticated;

-- Gold shares the same 16-riyal review among all co-authors, without tier checks.
create or replace function private.mark_avatar_reward_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare review_time timestamptz; gold boolean;
begin
 if tg_op='UPDATE' and new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time'
 and new.data->>'rating'=old.data->>'rating' and new.employee_ids=old.employee_ids then
 new.avatar_reward_employee_ids:=old.avatar_reward_employee_ids; return new; end if;
 new.avatar_reward_employee_ids:='{}';
 if (new.data->>'rating')::integer not in (4,5) then return new; end if;
 review_time:=least(private.record_at(new.data->>'date',new.data->>'time'),clock_timestamp());
 select exists(select 1 from unnest(new.employee_ids) profile
 where private.avatar_review_eligible(profile,review_time,new.id) and private.has_gold_avatar_privilege(profile,review_time)) into gold;
 if gold then new.avatar_reward_employee_ids:=new.employee_ids;
 else select coalesce(array_agg(profile order by profile),'{}') into new.avatar_reward_employee_ids
 from unnest(new.employee_ids) profile where private.avatar_review_eligible(profile,review_time,new.id); end if;
 return new;
end $$;

create or replace function private.mark_gold_plus_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time'
 and new.data->>'rating'=old.data->>'rating' and new.employee_ids=old.employee_ids then new.gold_plus:=old.gold_plus; return new; end if;
 new.gold_plus:=(new.data->>'rating')::integer in (4,5) and exists(select 1 from unnest(new.employee_ids) profile
 where private.avatar_review_eligible(profile,least(private.record_at(new.data->>'date',new.data->>'time'),clock_timestamp()),new.id)
 and private.has_gold_avatar_privilege(profile,least(private.record_at(new.data->>'date',new.data->>'time'),clock_timestamp())));
 return new;
end $$;

-- Ignore a single recorded rescue day in addition to the one grace per phase.
create function private.sea_first_failure(requested_branch text) returns integer
language plpgsql stable security definer set search_path='' as $$
declare mission_day integer; phase integer; target integer; used integer[]:='{}'; total integer; opening integer; tomorrow_opening integer; starts timestamptz; ends timestamptz; d date;
begin
 if requested_branch not in ('جاليري','ذافيو','سلام','القصر','المملكة','شرق') then raise invalid_parameter_value; end if;
 for mission_day in 5..30 loop
  d:=make_date(2026,11,mission_day); phase:=case when mission_day<=15 then 1 when mission_day<=25 then 2 else 3 end;
  target:=phase+1;
  opening:=case requested_branch when 'جاليري' then 14 when 'القصر' then 14 when 'ذافيو' then 12 when 'المملكة' then 10 when 'سلام' then 10 else 7 end;
  tomorrow_opening:=opening;
  if extract(dow from d)=5 then opening:=14; end if;
  if extract(dow from d+1)=5 then tomorrow_opening:=14; end if;
  starts:=(d+make_time(opening,0,0)) at time zone 'Asia/Riyadh';
  ends:=(d+1+make_time(tomorrow_opening,0,0)) at time zone 'Asia/Riyadh';
  if ends>now() then exit; end if;
  if exists(select 1 from private.avatar_sea_returns r where r.branch=requested_branch and r.day=mission_day) then continue; end if;
  if exists(select 1 from public.sea_mission_completions c where c.branch=requested_branch and c.day=mission_day) then continue; end if;
  select count(*) into total from public.reviews r where r.rating>=4 and
   case r.branch when 'الرياض جاليري' then 'جاليري' when 'القصر مول' then 'القصر' when 'شرق بلازا' then 'شرق' else r.branch end=requested_branch
   and r.occurred_at>=starts and r.occurred_at<ends;
  if total>=target then continue; end if;
  if total>=ceil(target/2.0) and not phase=any(used) then used:=array_append(used,phase);
  else return mission_day; end if;
 end loop;
 return null;
end $$;
revoke all on function private.sea_first_failure(text) from public,anon,authenticated;
create function public.use_avatar_sea_return() returns void
language plpgsql security definer set search_path='' as $$
declare actor text:=private.account_profile(); branch text; failed integer;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if not private.avatar_month_active(actor,date '2026-11-01') or not private.has_gold_avatar_privilege(actor,least(now(),timestamp '2026-12-01 00:00' at time zone 'Asia/Riyadh')-interval '1 microsecond')
 or not exists(select 1 from public.employee_feature_settings where id=1 and (data->>'avatars')::boolean)
 or exists(select 1 from private.reward_month_closures where period=date '2026-11-01') then raise insufficient_privilege; end if;
 select case p.branch when 'الرياض جاليري' then 'جاليري' when 'القصر مول' then 'القصر' when 'شرق بلازا' then 'شرق' else p.branch end into branch from public.profiles p where p.id=actor;
 failed:=private.sea_first_failure(branch);
 if failed is null then raise invalid_parameter_value; end if;
 insert into private.avatar_sea_returns(branch,day,actor) values(branch,failed,actor);
end $$;
revoke all on function public.use_avatar_sea_return() from public,anon;
grant execute on function public.use_avatar_sea_return() to authenticated;

-- Keep month-end selections as historical evidence, and freeze them on closure.
alter function public.get_monthly_avatars(date) rename to get_monthly_avatars_before_closure;
revoke all on function public.get_monthly_avatars_before_closure(date) from public,anon,authenticated;
create function public.get_monthly_avatars(requested_month date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is null then raise insufficient_privilege; end if;
 select avatars into result from private.reward_month_closures where period=requested_month;
 if found then return result; end if;
 result:=public.get_monthly_avatars_before_closure(requested_month);
 return (select coalesce(jsonb_object_agg(e.key,case when private.avatar_month_active(e.key,requested_month,(requested_month+interval '1 month') at time zone 'Asia/Riyadh') then e.value else 'null'::jsonb end),'{}') from jsonb_each(result) e);
end $$;
revoke all on function public.get_monthly_avatars(date) from public,anon;
grant execute on function public.get_monthly_avatars(date) to authenticated;

create function private.avatar_month_snapshot(period date) returns jsonb
language sql stable security definer set search_path='' as $$
 with scores as (select * from private.avatar_month_scores(period,least(now(),(period+interval '1 month') at time zone 'Asia/Riyadh')) s where not private.employee_is_disabled(s.profile_id)),
 plus as (
 select member, sum(1.0/cardinality(r.employee_ids)) shares,
 sum(floor(1600.0/cardinality(r.employee_ids))+(array_position(array(select unnest(r.employee_ids) order by 1),member)<=1600%cardinality(r.employee_ids))::integer) cents
 from public.reviews r cross join lateral unnest(r.employee_ids) member
 where r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh' and r.occurred_at<(period+interval '1 month') at time zone 'Asia/Riyadh'
 and (case when r.avatar_reward_employee_ids is not null then member=any(r.avatar_reward_employee_ids) else r.gold_plus end) and r.rating>=4 group by member
 ), settings as (select coalesce((data->>'rounding')::boolean,false) rounding from public.employee_feature_settings where id=1),
 amounts as (
 select s.*,coalesce(p.cents,0) plus,
 case when s.balance>=7.1 then round(greatest(0,round(s.balance-coalesce(p.shares,0),1))*100*
 case when s.points>=11 or (rounding and s.points>=10.8) then 14 when s.points>=8 or (rounding and s.points>=7.8) then 10 else 0 end) else 0 end cents,
 settings.rounding from scores s left join plus p on p.member=s.profile_id cross join settings
 ), common as (select case when bool_or(rounding) then greatest(0,10000-min(cents) filter(where cents>0)) else 0 end increase from amounts),
 totals as (
 select a.*,case when cents<=0 then 0 when rounding then greatest(10000,least(ceil((cents+c.increase)/1000)*1000,floor((cents+2000)/1000)*1000)) else greatest(10000,cents) end ordinary_total
 from amounts a cross join common c
 ) select coalesce(jsonb_object_agg(profile_id,jsonb_build_object('points',points,'monthReviewsCount',balance,
 'goldPlusCents',plus,'qualifyingPoints',case when rounding and points>=10.8 then 11 when rounding and points>=7.8 and points<8 then 8 else points end,
 'tier',case when points>=11 or (rounding and points>=10.8) then 'gold' when points>=8 then 'silver' else 'bronze' end,'base',(cents+plus)/100,'total',(ordinary_total+plus)/100,'increase',(ordinary_total-cents)/100)),'{}') from totals;
$$;
revoke all on function private.avatar_month_snapshot(date) from public,anon,authenticated;
create function public.close_reward_month(requested_month date) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if requested_month is null or requested_month<>date_trunc('month',requested_month)::date or requested_month<date '2000-01-01'
 or requested_month>=date_trunc('month',now() at time zone 'Asia/Riyadh')::date then raise invalid_parameter_value; end if;
 insert into private.reward_month_closures(period,closed_by,snapshot,avatars)
 values(requested_month,private.account_profile(),private.avatar_month_snapshot(requested_month),public.get_monthly_avatars(requested_month));
end $$;
revoke all on function public.close_reward_month(date) from public,anon;
grant execute on function public.close_reward_month(date) to authenticated;

create function private.protect_closed_reward_records() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_period date; new_period date;
begin
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if tg_op<>'INSERT' then old_period:=date_trunc('month',private.record_at(old.data->>'date',old.data->>'time') at time zone 'Asia/Riyadh')::date; end if;
 if tg_op<>'DELETE' then new_period:=date_trunc('month',private.record_at(new.data->>'date',new.data->>'time') at time zone 'Asia/Riyadh')::date; end if;
 if exists(select 1 from private.reward_month_closures where period in (old_period,new_period)) then raise exception 'Reward month is closed' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.protect_closed_reward_records() from public,anon,authenticated;
create trigger aa_closed_reward_records before insert or update or delete on public.reviews for each row execute function private.protect_closed_reward_records();
create trigger aa_closed_reward_records before insert or update or delete on public.timeline_events for each row execute function private.protect_closed_reward_records();

create function private.protect_closed_sea_completions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if exists(select 1 from private.reward_month_closures where period=date '2026-11-01') then raise exception 'Reward month is closed' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.protect_closed_sea_completions() from public,anon,authenticated;
create trigger aa_closed_sea_completions before insert or update or delete on public.sea_mission_completions for each row execute function private.protect_closed_sea_completions();

-- Shared read projection: only public employee IDs and effects, never account credentials.
create function private.avatar_privilege_state() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'uses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'period',period,'actor',actor,'kind',kind,'reviewId',review_id,'recipients',recipients,'gold',gold,'targetPoints',target_points,'usedAt',used_at) order by id),'[]') from private.avatar_privilege_uses),
 'seaReturns',(select coalesce(jsonb_agg(jsonb_build_object('branch',branch,'day',day,'actor',actor,'usedAt',used_at)),'[]') from private.avatar_sea_returns),
 'closures',(select coalesce(jsonb_agg(jsonb_build_object('period',period,'closedAt',closed_at,'snapshot',snapshot) order by period),'[]') from private.reward_month_closures),
 'purchaseMonths',(select coalesce(jsonb_agg(distinct date_trunc('month',purchased_at at time zone 'Asia/Riyadh')::date),'[]') from public.avatar_purchases where profile_id=private.account_profile())
 );
$$;
revoke all on function private.avatar_privilege_state() from public,anon,authenticated;
alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_privilege_uses;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is null then raise insufficient_privilege; end if;
 return private.read_model_before_privilege_uses()||jsonb_build_object('avatarPrivileges',private.avatar_privilege_state());
end $$;
revoke all on function private.read_model_before_privilege_uses() from public,anon,authenticated;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;

alter function public.get_avatar_store() set schema private;
alter function private.get_avatar_store() rename to avatar_store_before_activation;
revoke all on function private.avatar_store_before_activation() from public,anon,authenticated;
create function public.get_avatar_store() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; period date:=date_trunc('month',now() at time zone 'Asia/Riyadh')::date; active boolean;
begin
 if auth.uid() is null or private.account_role() is null then raise insufficient_privilege; end if;
 result:=private.avatar_store_before_activation();
 active:=private.avatar_month_active(private.account_profile(),period);
 result:=jsonb_set(result,'{equipped}',(select coalesce(jsonb_object_agg(e.key,e.value),'{}') from jsonb_each(result->'equipped') e where private.avatar_month_active(e.key,period)));
 if not active then result:=jsonb_set(result,'{selectedVariant}','null'); end if;
 return result||jsonb_build_object('monthActive',active);
end $$;
revoke all on function public.get_avatar_store() from public,anon;
grant execute on function public.get_avatar_store() to authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
