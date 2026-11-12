-- Rocket launch reward: 500 coins and 480 stars; coffee reward: 125 coins and 100 stars; eligibility remains unchanged.
create or replace function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 legacy jsonb:=private.graded_review_progression(profile,cutoff);
 start_month constant date:=date '2026-12-01';
 period date; peak numeric;
 sea_count integer; branch_count integer; branch_stars integer; coins numeric; stars numeric; highest numeric:=0;
begin
 coins:=(legacy->>'coins')::numeric;
 stars:=(legacy->>'stars')::numeric;
 -- Use the same Riyadh opening-to-opening window as the sea campaign.
 -- Shared daily branch reward, including staff without a personal review that day.
 sea_count:=private.sea_daily_completed_days(profile,cutoff);
 coins:=coins+sea_count*10;
 stars:=stars+sea_count*10;
 select coalesce(sum(case b.badge when 'milestone' then 10000 when 'milestone500' then 1000 when 'rocket' then 500 when 'coffee' then 125 else 25 end),0),
 coalesce(sum(case b.badge when 'rocket' then 480 when 'coffee' then 100 else 0 end),0)
 into branch_count,branch_stars
 from private.earned_branch_badges(cutoff) b
 where b.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 and case when b.badge in ('milestone','milestone500') then exists (
   select 1 from private.branch_badge_reward_recipients recipient
   where recipient.branch=b.branch and recipient.badge=b.badge and recipient.period=b.period
   and recipient.profile_id=profile and recipient.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 ) else 5<=(
   select count(*) from public.reviews r
   where r.branch=b.branch and r.rating>=4 and profile=any(r.employee_ids)
   and r.occurred_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at>=b.period::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<(b.period+interval '1 month') at time zone 'Asia/Riyadh'
 ) end;
 coins:=coins+branch_count;
 stars:=stars+branch_stars;

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
