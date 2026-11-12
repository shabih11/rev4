begin;
-- Server-authoritative, derived rewards: one award per grade and period.
-- Historical earnings before launch retain the legacy calculation.
create function private.graded_review_progression(profile text, cutoff date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 result jsonb:=private.employee_progression_legacy(profile,least(cutoff,date '2026-10-31'));
 coins numeric:=(result->>'coins')::numeric; stars numeric:=0;
 period date; positives integer; days integer; partnerships integer; partners integer;
 shares numeric; recovery numeric; daily_count integer; grade integer; multiplier numeric;
 month_coins numeric; month_stars numeric;
begin
 for period in
  select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date
  from public.reviews r where profile=any(r.employee_ids)
  and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-11-01' and cutoff order by 1
 loop
  select count(*) filter(where r.rating>=4),
   count(distinct (r.occurred_at at time zone 'Asia/Riyadh')::date) filter(where r.rating>=4),
   coalesce(sum(1.0/cardinality(r.employee_ids)) filter(where r.rating>=4),0)
  into positives,days,shares from public.reviews r
  where profile=any(r.employee_ids) and r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<least((period+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh';
  select count(*),coalesce(max(n),0) into partners,partnerships from (
   select member,count(*) n from public.reviews r cross join lateral unnest(r.employee_ids) member
   where profile=any(r.employee_ids) and member<>profile and r.rating>=4
   and r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<least((period+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   group by member
  ) p;
  select 4.0/cardinality(r.employee_ids) into recovery from public.reviews r
  where profile=any(r.employee_ids) and r.rating<=2
   and r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<least((period+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
  order by (r.occurred_at at time zone 'Asia/Riyadh')::date,r.id limit 1;
  month_coins:=0; month_stars:=0;
  for grade in 1..3 loop
   multiplier:=power(2.25::numeric,grade-1);
   select count(*) into daily_count from (
    select (r.occurred_at at time zone 'Asia/Riyadh')::date from public.reviews r
    where profile=any(r.employee_ids) and r.rating>=4
     and r.occurred_at>=period::timestamp at time zone 'Asia/Riyadh'
     and r.occurred_at<least((period+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
    group by 1 having count(*)>=(array[2,3,5])[grade]
   ) d;
   month_coins:=month_coins+daily_count*round(5*multiplier,2)
    +case when positives>=(array[10,20,35])[grade] then round(25*multiplier,2) else 0 end
    +case when days>=(array[5,8,12])[grade] then round(20*multiplier,2) else 0 end
    +case when partnerships>=(array[2,4,6])[grade] then round(10*multiplier,2) else 0 end
    +case when partners>=(array[3,4,5])[grade] then round(15*multiplier,2) else 0 end
    +case when recovery is not null and greatest(0,shares-20)+0.000000001>=recovery*(array[1,1.5,2.5])[grade] then round(20*multiplier,2) else 0 end;
   month_stars:=month_stars+daily_count*round(5*multiplier,2)
    +case when positives>=(array[10,20,35])[grade] then round(30*multiplier,2) else 0 end
    +case when days>=(array[5,8,12])[grade] then round(25*multiplier,2) else 0 end
    +case when partnerships>=(array[2,4,6])[grade] then round(15*multiplier,2) else 0 end
    +case when partners>=(array[3,4,5])[grade] then round(20*multiplier,2) else 0 end
    +case when recovery is not null and greatest(0,shares-20)+0.000000001>=recovery*(array[1,1.5,2.5])[grade] then round(25*multiplier,2) else 0 end;
  end loop;
  coins:=coins+positives*5+month_coins;
  stars:=stars+positives*5+month_stars;
 end loop;
 return jsonb_build_object('coins',coins,'stars',stars);
end $$;
revoke all on function private.graded_review_progression(text,date) from public,anon,authenticated;

create or replace function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 legacy jsonb:=private.graded_review_progression(profile,cutoff);
 start_month constant date:=date '2026-12-01';
 period date; peak numeric;
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
   peak:=private.monthly_peak_score(profile,period,least((period+interval '1 month')::date,cutoff+1));
   highest:=greatest(highest,peak);
   -- Rating and mission rewards are already included in graded_review_progression.
   coins:=coins+(case when peak>=8 then 30 else 0 end)+(case when peak>=11 then 50 else 0 end);
   stars:=stars+(case when peak>=8 then 25 else 0 end)+(case when peak>=11 then 40 else 0 end);
 end loop;
 return jsonb_build_object('coins',coins,'stars',stars,'highestTier',case when highest>=11 then 'gold' when highest>=8 then 'silver' else 'bronze' end);
end $$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;

commit;
