begin;

-- Preserve the existing progression rules through November 2026.
alter function private.employee_progression(text,date) rename to employee_progression_legacy;

create table private.branch_badge_rewards (
 branch text not null references public.branches(id),
 badge text not null check (badge in ('coffee','rocket','milestone')),
 period date not null,
 approved_at timestamptz not null default clock_timestamp(),
 primary key (branch,badge,period)
);
alter table private.branch_badge_rewards enable row level security;
revoke all on private.branch_badge_rewards from public,anon,authenticated;

create function public.approve_branch_badge_reward(requested_branch text, requested_badge text) returns void
language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Riyadh')::date; period date; coffee_end date; coffee_winner text;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested_badge is null or requested_badge not in ('coffee','rocket','milestone') then raise invalid_parameter_value; end if;
 period:=case when requested_badge='milestone' then date '2026-12-01' else date_trunc('month',today)::date end;
 if today<date '2026-12-01' then raise invalid_parameter_value; end if;
 if requested_badge='milestone' and (select count(*) from public.reviews where branch=requested_branch and occurred_at<=now())<1000
 then raise invalid_parameter_value; end if;
 if requested_badge='rocket' and not exists (
   select 1 from (
     select count(*) over(order by (occurred_at at time zone 'Asia/Riyadh')::date range between interval '6 days' preceding and current row) reviews_in_week
     from public.reviews where branch=requested_branch
       and occurred_at>=period::timestamp at time zone 'Asia/Riyadh' and occurred_at<=now()
   ) rocket where reviews_in_week>=100
 ) then raise invalid_parameter_value; end if;
 if requested_badge='coffee' then
   coffee_end:=period+((7-extract(dow from period)::integer)%7);
   if today<coffee_end then raise invalid_parameter_value; end if;
   select min(branch) into coffee_winner from (
     select branch,dense_rank() over(order by count(*) desc) rank
     from public.reviews
     where occurred_at>=(coffee_end-3)::timestamp at time zone 'Asia/Riyadh'
       and occurred_at<coffee_end::timestamp at time zone 'Asia/Riyadh'
     group by branch
   ) leaders where rank=1 having count(*)=1;
   if coffee_winner is distinct from requested_branch then raise invalid_parameter_value; end if;
 end if;
 insert into private.branch_badge_rewards(branch,badge,period) values(requested_branch,requested_badge,period)
 on conflict do nothing;
end $$;
revoke all on function public.approve_branch_badge_reward(text,text) from public,anon;
grant execute on function public.approve_branch_badge_reward(text,text) to authenticated;
create trigger sea_reward_version after insert on public.sea_mission_completions
for each statement execute function private.bump_version();

create trigger branch_badge_reward_version after insert on private.branch_badge_rewards
for each statement execute function private.bump_version();

create function private.monthly_peak_score(profile text, period date, end_day date) returns numeric
language sql stable security definer set search_path='' as $$
 with limits as (
   select period::timestamp at time zone 'Asia/Riyadh' start_at,
     end_day::timestamp at time zone 'Asia/Riyadh' end_at
 ), events as (
   select occurred_at, case when rating>=4 then 1.0/cardinality(employee_ids) else 0 end positive,
     case when rating<=2 then 0.5/cardinality(employee_ids) else 0 end negative, 0 penalties
   from public.reviews cross join limits
   where profile=any(employee_ids) and occurred_at>=start_at and occurred_at<end_at
   union all
   select occurred_at,0,0, (data->>'title' like '%شكوى%')::integer + (data->>'title' like '%سلامة%')::integer
   from public.timeline_events cross join limits
   where kind='gap' and profile=any(employee_ids) and occurred_at>=start_at and occurred_at<end_at
 ), moments as (
   select sum(positive) over(order by occurred_at) positive_total,
     sum(negative) over(order by occurred_at) negative_total,
     sum(penalties) over(order by occurred_at) penalty_total
   from events
 ), manual as (
   select coalesce((data#>>'{manualStats,positive}')::numeric,0) positive,
     coalesce((data#>>'{manualStats,negative}')::numeric,0) negative,
     coalesce((data#>>'{manualStats,monthReviews}')::numeric,0) balance,
     coalesce((data#>>'{manualStats,complaints}')::numeric,0) + coalesce((data#>>'{manualStats,safety}')::numeric,0) penalties
   from public.profiles where id=profile
 )
 select coalesce(max(
   least(5,m.positive_total*0.25+a.positive)
   +least(2,greatest(0,2-m.negative_total+a.negative+greatest(0,m.positive_total+a.balance-20)*0.125))
   +greatest(0,4-m.penalty_total-a.penalties)
 ),0) from moments m cross join manual a;
$$;
revoke all on function private.monthly_peak_score(text,date,date) from public,anon,authenticated;

create function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 legacy jsonb:=private.employee_progression_legacy(profile,least(cutoff,date '2026-11-30'));
 start_month constant date:=date '2026-12-01';
 period date; positives integer; days integer; shared integer; partners integer; peak numeric;
 sea_count integer; branch_count integer; coins numeric; stars numeric; highest numeric:=0;
begin
 coins:=(legacy->>'coins')::numeric;
 stars:=(legacy->>'stars')::numeric;
 -- Use the same Riyadh opening-to-opening window as the sea campaign.
 select count(*) into sea_count from public.sea_mission_completions c
 cross join lateral (
   select make_date(2026,11,c.day) as day, make_date(2026,11,c.day)+1 as tomorrow
 ) d
 cross join lateral (
   select case when c.branch in ('جاليري','القصر') then 14 when c.branch='ذافيو' then 12
     when c.branch in ('المملكة','سلام') then 10 else 7 end opening
 ) h
 where d.day<=cutoff and c.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 and exists (
   select 1 from public.reviews r
   where profile=any(r.employee_ids) and r.rating>=4
   and case r.branch when 'الرياض جاليري' then 'جاليري' when 'القصر مول' then 'القصر' when 'شرق بلازا' then 'شرق' else r.branch end=c.branch
   and r.occurred_at>=((d.day+make_time(case when extract(dow from d.day)=5 then 14 else h.opening end,0,0)) at time zone 'Asia/Riyadh')
   and r.occurred_at<((d.tomorrow+make_time(case when extract(dow from d.tomorrow)=5 then 14 else h.opening end,0,0)) at time zone 'Asia/Riyadh')
   and r.occurred_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 );
 coins:=coins+sea_count*3;
 stars:=stars+sea_count*5;
 select count(*) into branch_count from private.branch_badge_rewards b
 where b.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 and 5<=(
   select count(*) from public.reviews r
   where r.branch=b.branch and r.rating>=4 and profile=any(r.employee_ids)
   and r.occurred_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   and (case when b.badge='milestone' then r.occurred_at<=b.approved_at
     else r.occurred_at>=b.period::timestamp at time zone 'Asia/Riyadh'
       and r.occurred_at<(b.period+interval '1 month') at time zone 'Asia/Riyadh' end)
 );
 coins:=coins+branch_count*25;
 stars:=stars+branch_count*20;

 for period in
   select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date
   from public.reviews r where profile=any(r.employee_ids) and r.rating>=4
   and (r.occurred_at at time zone 'Asia/Riyadh')::date between start_month and cutoff
 loop
   with reviews as (
     select r.employee_ids,r.occurred_at from public.reviews r
     where profile=any(r.employee_ids) and r.rating>=4
     and r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh'
     and r.occurred_at<least((period+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   )
   select count(*),count(distinct (r.occurred_at at time zone 'Asia/Riyadh')::date),
     count(*) filter(where cardinality(r.employee_ids)>1),
     (select count(distinct member) from reviews x cross join lateral unnest(x.employee_ids) member where member<>profile)
   into positives,days,shared,partners from reviews r;
   peak:=private.monthly_peak_score(profile,period,least((period+interval '1 month')::date,cutoff+1));
   highest:=greatest(highest,peak);
   coins:=coins+positives*5+(case when positives>=18 then 40 else 0 end)
     +(case when days>=8 then 35 else 0 end)+(case when shared>=4 and partners>=2 then 30 else 0 end)
     +(case when peak>=8 then 30 else 0 end)+(case when peak>=11 then 50 else 0 end);
   stars:=stars+positives*5+(case when positives>=18 then 30 else 0 end)
     +(case when days>=8 then 25 else 0 end)+(case when shared>=4 and partners>=2 then 30 else 0 end)
     +(case when peak>=8 then 25 else 0 end)+(case when peak>=11 then 40 else 0 end);
 end loop;
 return jsonb_build_object('coins',coins,'stars',stars,'highestTier',case when highest>=11 then 'gold' when highest>=8 then 'silver' else 'bronze' end);
end $$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;

-- Rebind SQL-function dependencies to the new progression implementation.
create or replace function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (select private.employee_progression(profile) total),
 spending as (select coalesce(sum(price_paid),0) total from (
  select price_paid from public.avatar_purchases where profile_id=profile
  union all select price_paid from public.gem_purchases where profile_id=profile
  union all select u.price_paid from private.gold_avatar_upgrades u join public.avatar_purchases p on p.variant_id=u.variant_id where p.profile_id=profile
 ) p)
 select jsonb_build_object('earned',(e.total->>'coins')::numeric,'stars',(e.total->>'stars')::numeric,
 'highestTier',e.total->>'highestTier','spent',s.total,'available',greatest(0,(e.total->>'coins')::numeric-s.total)) from earnings e cross join spending s;
$$;
-- Member-visible approval status is limited to branch, badge and period.
alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_branch_badge_rewards;
revoke all on function private.read_model_before_branch_badge_rewards() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language sql stable security definer set search_path='' as $$
 select private.read_model_before_branch_badge_rewards() || jsonb_build_object('branchBadgeRewards',(
   select coalesce(jsonb_agg(jsonb_build_object('branch',branch,'badge',badge,'period',period) order by branch,badge,period),'[]')
   from private.branch_badge_rewards
 ));
$$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;
commit;
