-- Keep monthly surplus review shares available to offset existing or later negative reviews.
create or replace function private.employee_scores(cutoff timestamptz default now())
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
   least(2,greatest(0,2-coalesce(c.negative,0)+coalesce((p.data#>>'{manualStats,negative}')::numeric,0)
     +greatest(0,coalesce(c.balance,0)+coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0)-20)*0.125))+
   greatest(0,4-coalesce(n.complaints,0)-coalesce(n.safety,0)-coalesce((p.data#>>'{manualStats,complaints}')::numeric,0)-coalesce((p.data#>>'{manualStats,safety}')::numeric,0))
 from public.profiles p left join credits c on c.member=p.id left join penalties n on n.member=p.id where p.data->>'role'='employee';
$$;
revoke all on function private.employee_scores(timestamptz) from public,anon,authenticated;
