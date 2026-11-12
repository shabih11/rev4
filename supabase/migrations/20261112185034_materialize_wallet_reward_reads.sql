begin;
-- PostgreSQL may inline scalar CTEs and repeat expensive derived earnings for
-- every JSON field. Evaluate each value once without changing its calculation.
do $$
declare signature text; definition text; updated text;
begin
 foreach signature in array array[
  'private.employee_progression(text,date)',
  'private.progression_before_tier_missions(text,date)',
  'private.graded_review_progression(text,date)',
  'private.avatar_wallet_before_collection(text)',
  'private.avatar_wallet_before_rank(text)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=regexp_replace(definition,'\m(prior|old|earnings|wallet|pending|amounts|spending|awards|days)\s+as\s*\(','\1 as materialized (','gi');
  if updated<>definition then execute updated; end if;
 end loop;
end $$;
-- Replay only this employee's deltas once, rather than recomputing every
-- employee's complete score at every historical event.
create or replace function private.tier_peak_points(profile text, requested_period date, asof timestamptz) returns numeric
language sql stable security definer set search_path='' as $$
 with limits as materialized (
  select requested_period::timestamp at time zone 'Asia/Riyadh' starts,
   least(asof,(requested_period+interval '1 month') at time zone 'Asia/Riyadh') ends
 ), person as materialized (
  select data from public.profiles where id=profile and data->>'role'='employee'
 ), deltas as (
  select starts+interval '1 microsecond' at_time,0::numeric balance,0::numeric positive,0::numeric negative,0::numeric penalty from limits where ends>starts
  union all select ends,0,0,0,0 from limits where ends>starts
  union all
  select r.occurred_at+interval '1 microsecond',
   case when r.rating>=4 then 1.0/cardinality(r.employee_ids) else 0 end,
   case when r.rating>=4 then 0.25/cardinality(r.employee_ids) else 0 end,
   case when r.rating<=2 and not exists(select 1 from private.avatar_privilege_uses u where u.period=requested_period and u.kind='erase' and u.review_id=r.id and u.recipients @> array[profile]) then 0.5/cardinality(r.employee_ids) else 0 end,0
  from public.reviews r cross join limits l
  where r.employee_ids @> array[profile] and r.occurred_at>=l.starts and r.occurred_at<l.ends
  union all
  select t.occurred_at+interval '1 microsecond',0,0,0,
   (t.data->>'title' like '%شكوى%')::integer+(t.data->>'title' like '%سلامة%')::integer
  from public.timeline_events t cross join limits l
  where t.kind='gap' and t.employee_ids @> array[profile] and t.occurred_at>=l.starts and t.occurred_at<l.ends
 ), grouped as (
  select at_time,sum(balance) balance,sum(positive) positive,sum(negative) negative,sum(penalty) penalty from deltas group by at_time
 ), running as (
  select sum(balance) over w balance,sum(positive) over w positive,sum(negative) over w negative,sum(penalty) over w penalty
  from grouped window w as (order by at_time rows between unbounded preceding and current row)
 ), scores as (
  select least(5,r.positive+coalesce((p.data#>>'{manualStats,positive}')::numeric,0))+
   least(2,greatest(0,2-r.negative+coalesce((p.data#>>'{manualStats,negative}')::numeric,0)
    +greatest(0,r.balance+coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0)-20)*0.125))+
   greatest(0,4-r.penalty-coalesce((p.data#>>'{manualStats,complaints}')::numeric,0)-coalesce((p.data#>>'{manualStats,safety}')::numeric,0)) points
  from running r cross join person p
 ) select coalesce(max(least(11,greatest(s.points,coalesce((select max(u.target_points) from private.avatar_privilege_uses u
  where u.period=requested_period and u.kind='complete' and u.recipients @> array[profile] and u.target_points-s.points between 0 and 0.5),s.points)))),0)
 from (select * from scores union all select s.points from limits l cross join lateral private.employee_scores(l.ends) s where l.ends>l.starts and s.profile_id=profile) s;
$$;
revoke all on function private.tier_peak_points(text,date,timestamptz) from public,anon,authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
