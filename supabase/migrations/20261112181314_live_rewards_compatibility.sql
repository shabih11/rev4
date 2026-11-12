begin;

create temporary table release_catalog_integrity on commit drop as
select (select md5(string_agg(id::text||':'||price::text||':'||enabled::text,',' order by id)) from public.avatar_collections) collections,
 (select md5(string_agg(id::text||':'||price_adjustment::text||':'||enabled::text,',' order by id)) from public.avatar_variants) variants,
 (select md5(string_agg(variant_id::text||':'||profile_id||':'||price_paid::text,',' order by variant_id)) from public.avatar_purchases) purchases;
-- Upgrade older live schemas without replaying catalog data or resetting prices.
do $compat$ begin if to_regprocedure('private.mark_gold_plus_review()') is null then execute $release$


create function private.is_gold_avatar_art(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.gold_avatar_upgrades where image_path=path);
$$;
revoke all on function private.is_gold_avatar_art(text) from public,anon;
grant execute on function private.is_gold_avatar_art(text) to authenticated;
alter policy avatar_art_cleanup on storage.objects using (
 bucket_id='avatar-store' and (select private.account_role())='admin'
 and not exists(select 1 from public.avatar_variants v where v.image_path=storage.objects.name)
 and not private.is_gold_avatar_art(name)
);

alter table public.reviews add column gold_plus boolean not null default false;
create function private.mark_gold_plus_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare review_time timestamptz;
begin
 new.gold_plus:=false;
 if (new.data->>'rating')::integer not in (4,5) then return new; end if;
 if tg_op='UPDATE' and old.gold_plus
   and new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time' then
   new.gold_plus:=true;
 else
   review_time:=private.record_at(new.data->>'date',new.data->>'time');
   select exists(select 1 from (
     select p.profile_id,u.fulfilled_at active_at
     from private.gold_avatar_upgrades u join public.avatar_purchases p on p.variant_id=u.variant_id
     where u.fulfilled_at is not null
     union all
     select p.profile_id,p.purchased_at from public.avatar_purchases p where p.included_gold_burqa
   ) entitlement
   where entitlement.profile_id=any(new.employee_ids) and entitlement.active_at<=review_time
     and exists(select 1 from private.employee_scores(review_time) scores
       where scores.profile_id=entitlement.profile_id and scores.balance>=20)
   ) into new.gold_plus;
 end if;
 return new;
end $$;
revoke all on function private.mark_gold_plus_review() from public,anon,authenticated;
create trigger zz_gold_plus_review before insert or update on public.reviews
for each row execute function private.mark_gold_plus_review();

alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_gold_plus;
revoke all on function private.read_model_before_gold_plus() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.read_model_before_gold_plus();
 return jsonb_set(result,'{reviews}',(
   select coalesce(jsonb_agg(case when r.gold_plus then item||'{"goldPlus":true}'::jsonb else item end order by item->>'id'),'[]'::jsonb)
   from jsonb_array_elements(result->'reviews') item left join public.reviews r on r.id=item->>'id'
 ));
end $$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.employee_progression_legacy(text,date)') is null then execute $release$
do $clone$ declare definition text; begin
 definition:=pg_get_functiondef('private.progression_before_manual_milestones(text,date)'::regprocedure);
 definition:=replace(definition,'FUNCTION private.progression_before_manual_milestones(','FUNCTION private.employee_progression_legacy(');
 execute definition;
end $clone$;
revoke all on function private.employee_progression_legacy(text,date) from public,anon,authenticated;
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

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.graded_review_progression(text,date)') is null then execute $release$

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


$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.earned_branch_badges(date)') is null then execute $release$

alter table private.branch_badge_rewards drop constraint branch_badge_rewards_badge_check;
alter table private.branch_badge_rewards add constraint branch_badge_rewards_badge_check check(badge in ('coffee','rocket','milestone','milestone500'));
create function private.earned_branch_badges(cutoff date)
returns table(branch text,badge text,period date,approved_at timestamptz)
language sql stable security definer set search_path='' as $$
 with eligible as (
  select r.branch,r.occurred_at,(r.occurred_at at time zone 'Asia/Riyadh')::date as day
  from public.reviews r
  where r.occurred_at<least(now(),(cutoff+1)::timestamp at time zone 'Asia/Riyadh')
 ), rocket_windows as (
  select e.*,count(*) over(partition by e.branch order by e.day range between interval '6 days' preceding and current row) total
  from eligible e
 ), rocket as (
  select r.branch,'rocket'::text badge,date_trunc('month',r.day)::date period,max(r.occurred_at) approved_at
  from rocket_windows r where total>=100 and r.day>=date '2026-11-01'
  group by r.branch,date_trunc('month',r.day)
 ), months as (
  select generate_series(date '2026-11-01',least(cutoff,(now() at time zone 'Asia/Riyadh')::date),interval '1 month')::date period
 ), coffee_limits as (
  select m.period,case when m.period=date '2026-11-01' then date '2026-11-08' else m.period+((7-extract(dow from m.period)::integer)%7) end ending from months m
 ), coffee_counts as (
  select e.branch,c.period,c.ending,count(*) total
  from coffee_limits c join eligible e
   on e.occurred_at>=(c.ending-3)::timestamp at time zone 'Asia/Riyadh'
   and e.occurred_at<c.ending::timestamp at time zone 'Asia/Riyadh'
  where c.ending<=cutoff and c.ending<=(now() at time zone 'Asia/Riyadh')::date
  group by e.branch,c.period,c.ending
 ), ranked as (
  select c.*,dense_rank() over(partition by c.period order by c.total desc) position from coffee_counts c
 ), winners as (
  select min(r.branch) branch,'coffee'::text badge,r.period,r.ending::timestamp at time zone 'Asia/Riyadh' approved_at
  from ranked r where r.position=1 group by r.period,r.ending having count(*)=1
 )
 select b.branch,b.badge,b.period,b.approved_at from private.branch_badge_rewards b where b.badge in ('milestone','milestone500')
 union all select * from rocket
 union all select * from winners;
$$;
revoke all on function private.earned_branch_badges(date) from public,anon,authenticated;

alter function public.get_read_model() set schema private; alter function private.get_read_model() rename to read_model_before_branch_badge_rewards; revoke all on function private.read_model_before_branch_badge_rewards() from public,anon,authenticated;
create or replace function public.get_read_model() returns jsonb
language sql stable security definer set search_path='' as $$
 select private.read_model_before_branch_badge_rewards() || jsonb_build_object('branchBadgeRewards',(
   select coalesce(jsonb_agg(jsonb_build_object('branch',branch,'badge',badge,'period',period) order by branch,badge,period),'[]')
   from private.earned_branch_badges((now() at time zone 'Asia/Riyadh')::date)
 ));
$$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;

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
$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.has_gold_avatar_privilege(text,timestamp with time zone)') is null then execute $release$
create temporary table release_price_functions on commit drop as select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname='avatar_sale_price') or (n.nspname='public' and p.proname in ('adjust_avatar_price','save_avatar_collection'));

-- Raise catalogue prices once; preserve historical amounts paid and ownership.
alter table public.avatar_collections drop constraint avatar_base_price_range;
alter table public.avatar_collections add constraint avatar_base_price_range
 check (price=round(price) and price between 50 and 1000000);
alter table public.avatar_variants add column if not exists price_adjustment integer not null default 0;

create or replace function private.avatar_sale_price(collection public.avatar_collections, variant public.avatar_variants) returns numeric
language sql immutable set search_path='' as $$
 select collection.price+50*variant.abaya_grade+variant.price_adjustment
   +case when lower(trim(collection.name))='lv olympia' then 499 else 0 end;
$$;
revoke all on function private.avatar_sale_price(public.avatar_collections,public.avatar_variants) from public,anon,authenticated;

create function private.has_gold_avatar_privilege(profile text, cutoff timestamptz default now()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.avatar_purchases p where p.profile_id=profile and p.purchased_at<=cutoff
   and (p.included_gold_burqa or exists(select 1 from private.gold_avatar_upgrades u where u.variant_id=p.variant_id and u.price_paid>0 and u.requested_at<=cutoff)));
$$;
revoke all on function private.has_gold_avatar_privilege(text,timestamptz) from public,anon,authenticated;

-- Legacy clients cannot buy the privilege independently of its original collection.
create or replace function public.purchase_gold_avatar(variant uuid, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Gold privilege is included only with its original collection' using errcode='42501';
end $$;

create or replace function public.purchase_avatar(variant uuid,expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare actor text := private.account_profile(); item public.avatar_variants; collection public.avatar_collections; settings jsonb; funds numeric; price numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 -- Matches the existing profile/merge lock: purchases, merges, and selections cannot race.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select data into settings from public.employee_feature_settings where id=1 for share;
 if (settings->>'avatars')::boolean is distinct from true then raise exception 'Store disabled' using errcode='42501'; end if;
 select * into item from public.avatar_variants where id=variant for update;
 if not found or not item.enabled then raise exception 'Variant unavailable' using errcode='22023'; end if;
 select * into collection from public.avatar_collections where id=item.collection_id for share;
 if not collection.enabled then raise exception 'Avatar unavailable' using errcode='22023'; end if;
 if exists(select 1 from public.avatar_purchases where variant_id=variant) then raise exception 'Variant already owned' using errcode='23505'; end if;
 price:=private.avatar_sale_price(collection,item);
 if expected_price is distinct from price then raise exception 'Price changed' using errcode='PT409'; end if;
 -- Block concurrent source edits while validating current credit, without writing review data.
 lock table public.reviews in share mode;
 funds:=(private.avatar_wallet(actor)->>'available')::numeric;
 if funds<price then raise exception 'Insufficient store balance' using errcode='22023'; end if;
 insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa) values(variant,actor,price,lower(trim(collection.name))='lv olympia');
 if not (lower(trim(collection.name))='lv olympia') and private.has_gold_avatar_privilege(actor) then
   insert into private.gold_avatar_upgrades(variant_id,price_paid) values(variant,0);
 end if;
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;

create or replace function public.save_avatar_collection(collection_id uuid,requested_name text,requested_price numeric,requested_enabled boolean,expected jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actual public.avatar_collections; result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_name is null or length(trim(requested_name)) not between 1 and 100 or requested_price is null
   or requested_price not between 50 and 1000000 or requested_price<>round(requested_price) or requested_enabled is null
 then raise exception 'Invalid avatar' using errcode='22023'; end if;
 if collection_id is null then
  insert into public.avatar_collections(name,price,enabled) values(trim(requested_name),requested_price,requested_enabled) returning id into result;
 else
  select * into actual from public.avatar_collections where id=collection_id for update;
  if not found or expected is distinct from jsonb_build_object('name',actual.name,'price',actual.price,'enabled',actual.enabled) then raise exception 'write-conflict' using errcode='PT409'; end if;
  update public.avatar_collections set name=trim(requested_name),price=requested_price,enabled=requested_enabled where id=collection_id;
  result:=collection_id;
 end if;
 return result;
end $$;

create or replace function public.adjust_avatar_price(requested_collection uuid, requested_variant uuid, step integer, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare collection public.avatar_collections; variant public.avatar_variants; current_price numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if step is null or step not in (-50,50) then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select * into collection from public.avatar_collections where id=requested_collection for update;
 if not found then raise invalid_parameter_value; end if;
 if requested_variant is null then
   current_price:=collection.price;
 else
   select * into variant from public.avatar_variants where id=requested_variant and collection_id=requested_collection for update;
   if not found then raise invalid_parameter_value; end if;
   current_price:=private.avatar_sale_price(collection,variant);
 end if;
 if expected_price is distinct from current_price then raise exception 'write-conflict' using errcode='PT409'; end if;
 if current_price+step not between 50 and 1000000 then raise invalid_parameter_value; end if;
 if requested_variant is null then
   if exists(select 1 from public.avatar_variants v where v.collection_id=collection.id
     and private.avatar_sale_price(collection,v)+step not between 50 and 1000000) then raise invalid_parameter_value; end if;
   update public.avatar_collections set price=price+step where id=collection.id;
 else
   update public.avatar_variants set price_adjustment=price_adjustment+step where id=variant.id;
 end if;
end $$;
revoke all on function public.adjust_avatar_price(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.adjust_avatar_price(uuid,uuid,integer,numeric) to authenticated;

create or replace function public.get_avatar_store() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor text := private.account_profile(); admin boolean := private.account_role()='admin';
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 with owned_gold as materialized (
   select u.variant_id,u.image_path,p.profile_id from private.gold_avatar_upgrades u
   join public.avatar_purchases p on p.variant_id=u.variant_id where u.fulfilled_at<=now()
   union all
   select p.variant_id,v.image_path,p.profile_id from public.avatar_purchases p
   join public.avatar_variants v on v.id=p.variant_id where p.included_gold_burqa
 ), active_gold as materialized (
   select g.variant_id,g.image_path from owned_gold g
   join private.employee_scores() scores on scores.profile_id=g.profile_id and scores.balance>=20
 )
 select jsonb_build_object('collections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price,'enabled',c.enabled,
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'imagePath',coalesce(g.image_path,case when coalesce(p.included_gold_burqa,false)
 then replace(v.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else v.image_path end),'price',private.avatar_sale_price(c,v),'abayaGrade',v.abaya_grade,'includedGoldBurqa',coalesce(p.included_gold_burqa,false),'paidPrice',case when p.profile_id=actor then p.price_paid end,'goldUpgrade',case when p.profile_id=actor and (u.variant_id is not null or p.included_gold_burqa)
 then case when g.variant_id is not null then 'delivered' when p.included_gold_burqa or u.fulfilled_at is not null then 'locked' else 'pending' end end,'enabled',v.enabled,'ownerId',p.profile_id,'ownerName',pr.data->>'name') order by v.name,v.id),'[]') from public.avatar_variants v left join public.avatar_purchases p on p.variant_id=v.id left join private.gold_avatar_upgrades u on u.variant_id=v.id left join active_gold g on g.variant_id=v.id left join public.profiles pr on pr.id=p.profile_id where v.collection_id=c.id and (admin or v.enabled or p.profile_id=actor))) order by c.name,c.id),'[]') from public.avatar_collections c where admin or c.enabled or exists(select 1 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id where v.collection_id=c.id and p.profile_id=actor)),
 'wallet',case when private.account_role()='employee' then private.avatar_wallet(actor) else null end,
 'equipped',(select coalesce(jsonb_object_agg(e.profile_id,coalesce(g.image_path,case when coalesce(p.included_gold_burqa,false)
 then replace(v.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else v.image_path end)),'{}') from public.avatar_equipped e join public.avatar_purchases p on p.variant_id=e.variant_id and p.profile_id=e.profile_id join public.avatar_variants v on v.id=e.variant_id left join active_gold g on g.variant_id=v.id),
 'goldRequests',case when admin then (select coalesce(jsonb_agg(jsonb_build_object('id',u.variant_id,'name',v.name,'imagePath',v.image_path) order by u.requested_at),'[]') from private.gold_avatar_upgrades u join public.avatar_variants v on v.id=u.variant_id where u.fulfilled_at is null) else '[]'::jsonb end,
 'selectedVariant',(select variant_id from public.avatar_equipped where profile_id=actor)) into result;
 return result||jsonb_build_object('magic',private.magic_state(),'goldEntitled',private.has_gold_avatar_privilege(actor));
end $$;

-- Snapshot recipients on the review; never transfer a shared review's benefit to a colleague.
alter table public.reviews add column avatar_reward_employee_ids text[];
create function private.avatar_review_eligible(profile text, cutoff timestamptz, excluded_review text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.avatar_purchases p where p.profile_id=profile
   and p.purchased_at>=date_trunc('month',cutoff at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
   and p.purchased_at<=cutoff)
 and exists(select 1 from private.employee_scores(cutoff) scores where scores.profile_id=profile
   and scores.balance-coalesce((select 1.0/cardinality(r.employee_ids) from public.reviews r
     where r.id=excluded_review and profile=any(r.employee_ids) and r.rating>=4
       and r.occurred_at<cutoff and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')=date_trunc('month',cutoff at time zone 'Asia/Riyadh')),0)>=20);
$$;
revoke all on function private.avatar_review_eligible(text,timestamptz,text) from public,anon,authenticated;
create function private.mark_avatar_reward_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare review_time timestamptz;
begin
 if tg_op='UPDATE' then
   if new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time'
     and new.data->>'rating'=old.data->>'rating' and new.employee_ids=old.employee_ids then
     new.avatar_reward_employee_ids:=old.avatar_reward_employee_ids;
     return new;
   end if;
 end if;
 new.avatar_reward_employee_ids:='{}';
 if (new.data->>'rating')::integer not in (4,5) then return new; end if;
 review_time:=private.record_at(new.data->>'date',new.data->>'time');
 -- A future review cannot pre-book the benefit; eligibility is evaluated at entry too.
 select coalesce(array_agg(profile order by profile),'{}') into new.avatar_reward_employee_ids
 from unnest(new.employee_ids) profile
 where private.avatar_review_eligible(profile,least(review_time,clock_timestamp()),new.id);
 return new;
end $$;
revoke all on function private.mark_avatar_reward_review() from public,anon,authenticated;
create trigger zz_avatar_reward_review before insert or update on public.reviews
 for each row execute function private.mark_avatar_reward_review();

alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_avatar_rewards;
revoke all on function private.read_model_before_avatar_rewards() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.read_model_before_avatar_rewards();
 return jsonb_set(result,'{reviews}',(
   select coalesce(jsonb_agg(case when r.avatar_reward_employee_ids is not null
     then item||jsonb_build_object('avatarRewardEmployeeIds',r.avatar_reward_employee_ids) else item end order by item->>'id'),'[]'::jsonb)
   from jsonb_array_elements(result->'reviews') item left join public.reviews r on r.id=item->>'id'
 ));
end $$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;
do $restore$ declare item record; begin for item in select definition from release_price_functions loop execute item.definition; end loop; end $restore$;

$release$; end if; end $compat$;
do $compat$ begin if to_regclass('private.avatar_privilege_uses') is null then execute $release$

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

$release$; end if; end $compat$;
do $compat$ begin if to_regclass('private.coin_achievement_collections') is null then execute $release$


-- Only coin collection changes. The authoritative progression and its stars
-- remain unchanged. Each source has a cumulative entitlement; a collection
-- records its high-water mark so retries and restored records cannot pay twice.
create table private.coin_achievement_collections (
 profile_id text not null references public.profiles(id) on delete cascade,
 achievement_id text not null,
 coins numeric not null check(coins>=0),
 collected_at timestamptz not null default now(),
 primary key(profile_id,achievement_id)
);
alter table private.coin_achievement_collections enable row level security;
revoke all on private.coin_achievement_collections from public,anon,authenticated;

create function private.coin_achievements(profile text) returns table(id text,title text,period text,coins numeric)
language plpgsql stable security definer set search_path='' as $$
declare
 cutoff date:=(now() at time zone 'Asia/Riyadh')::date;
 month_start date; positives integer; active_days integer; partners integer; partnerships integer;
 shares numeric; recovery numeric; grade integer; multiplier numeric; sea_coins numeric;
begin
 return query select 'legacy'::text,'إنجازات التقييمات السابقة'::text,'حتى أكتوبر 2026'::text,
  (private.employee_progression_legacy(profile,least(cutoff,date '2026-10-31'))->>'coins')::numeric;

 return query select 'ratings:'||to_char(r.occurred_at at time zone 'Asia/Riyadh','YYYY-MM-DD'),
  'تقييماتك الإيجابية'::text,to_char(r.occurred_at at time zone 'Asia/Riyadh','YYYY-MM-DD'),count(*)*5::numeric
 from public.reviews r where profile=any(r.employee_ids) and r.rating>=4
 and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-11-01' and cutoff group by 1,3;

 return query select 'daily:'||to_char(r.occurred_at at time zone 'Asia/Riyadh','YYYY-MM-DD')||':'||g.n,
  (array['أثران في يوم واحد · الخضراء','ثلاثة آثار في يوم واحد · الزرقاء','خمسة آثار في يوم واحد · الذهبية'])[g.n],
  to_char(r.occurred_at at time zone 'Asia/Riyadh','YYYY-MM-DD'),round(5*power(2.25::numeric,g.n-1),2)
 from public.reviews r cross join generate_series(1,3) g(n)
 where profile=any(r.employee_ids) and r.rating>=4
 and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-11-01' and cutoff
 group by 1,2,3,g.n having count(*)>=(array[2,3,5])[g.n];

 for month_start in select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date
  from public.reviews r where profile=any(r.employee_ids)
  and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-11-01' and cutoff
 loop
  select count(*) filter(where r.rating>=4),
   count(distinct (r.occurred_at at time zone 'Asia/Riyadh')::date) filter(where r.rating>=4),
   coalesce(sum(1.0/cardinality(r.employee_ids)) filter(where r.rating>=4),0)
  into positives,active_days,shares from public.reviews r
  where profile=any(r.employee_ids) and r.occurred_at>=month_start::timestamp at time zone 'Asia/Riyadh'
  and r.occurred_at<least((month_start+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh';
  select count(*),coalesce(max(n),0) into partners,partnerships from (
   select member,count(*) n from public.reviews r cross join lateral unnest(r.employee_ids) member
   where profile=any(r.employee_ids) and member<>profile and r.rating>=4
   and r.occurred_at>=month_start::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<least((month_start+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   group by member
  ) p;
  select 4.0/cardinality(r.employee_ids) into recovery from public.reviews r
   where profile=any(r.employee_ids) and r.rating<=2
   and r.occurred_at>=month_start::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<least((month_start+interval '1 month')::date,cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   order by (r.occurred_at at time zone 'Asia/Riyadh')::date,r.id limit 1;
  for grade in 1..3 loop
   multiplier:=power(2.25::numeric,grade-1);
   return query select m.key||':'||to_char(month_start,'YYYY-MM')||':'||grade,
    m.label||' · '||(array['الخضراء','الزرقاء','الذهبية'])[grade],to_char(month_start,'YYYY-MM'),round(m.base*multiplier,2)
   from (values
    ('ten','حصاد الشهر',25::numeric,positives>=(array[10,20,35])[grade]),
    ('days','تألق مستمر',20::numeric,active_days>=(array[5,8,12])[grade]),
    ('partner','ثنائي متألق',10::numeric,partnerships>=(array[2,4,6])[grade]),
    ('partners','جسر الفريق',15::numeric,partners>=(array[3,4,5])[grade]),
    ('recovery','امحي أثر تقييم سلبي',20::numeric,recovery is not null and greatest(0,shares-20)+0.000000001>=recovery*(array[1,1.5,2.5])[grade])
   ) m(key,label,base,completed) where m.completed;
  end loop;
 end loop;

 sea_coins:=private.sea_daily_completed_days(profile,cutoff)*10;
 return query select 'sea'::text,'إنجاز مهمة البحر'::text,'نوفمبر 2026'::text,sea_coins;
 -- The remaining authoritative awards are branch badges and monthly tiers.
 -- Keep their installed eligibility and amounts, including manual recipients.
 return query select 'branch-and-tier'::text,'إنجازات شارات الفرع والفئات'::text,'المكافآت المستحقة'::text,
  greatest(0,(private.employee_progression(profile,cutoff)->>'coins')::numeric
   -(private.graded_review_progression(profile,cutoff)->>'coins')::numeric-sea_coins);
end $$;
revoke all on function private.coin_achievements(text) from public,anon,authenticated;

create function private.pending_coin_achievements(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'period',a.period,
  'coins',a.coins-coalesce(c.coins,0)) order by a.period desc,a.id),'[]')
 from private.coin_achievements(profile) a
 left join private.coin_achievement_collections c on c.profile_id=profile and c.achievement_id=a.id
 where a.coins>coalesce(c.coins,0);
$$;
revoke all on function private.pending_coin_achievements(text) from public,anon,authenticated;

-- Preserve every existing earning as already collected at rollout. A later
-- imported review or newly reached grade will expose only the new difference.
lock table public.reviews,public.profiles,public.timeline_events,public.sea_mission_completions,
 private.branch_badge_rewards,private.branch_badge_reward_recipients in share mode;
insert into private.coin_achievement_collections(profile_id,achievement_id,coins)
 select p.id,a.id,a.coins from public.profiles p cross join lateral private.coin_achievements(p.id) a
 where p.data->>'role'='employee' and a.coins>0;

alter function private.avatar_wallet(text) rename to avatar_wallet_before_collection;
revoke all on function private.avatar_wallet_before_collection(text) from public,anon,authenticated;
create function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with wallet as (select private.avatar_wallet_before_collection(profile) value),
 pending as (select private.pending_coin_achievements(profile) items),
 amounts as (select coalesce(sum((item->>'coins')::numeric),0) coins from pending,jsonb_array_elements(items) item)
 select value||jsonb_build_object('pendingAchievements',items,'pendingCoins',coins,
  'available',greatest(0,(value->>'earned')::numeric-(value->>'spent')::numeric-coins))
 from wallet cross join pending cross join amounts;
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;

create function public.collect_coin_achievement(achievement_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.account_profile(); entitlement numeric;
begin
 if auth.uid() is null or actor is null or private.account_role() is distinct from 'employee'
  or private.employee_is_disabled(actor) then raise insufficient_privilege; end if;
 if achievement_id is null or length(achievement_id) not between 1 and 160 then raise invalid_parameter_value; end if;
 -- Match record/merge lock ordering; serialize this employee's claims and purchases.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.profiles where id=actor for update;
 select a.coins into entitlement from private.coin_achievements(actor) a where a.id=achievement_id;
 if entitlement is null or entitlement<=0 then raise exception 'Achievement unavailable' using errcode='22023'; end if;
 insert into private.coin_achievement_collections as c(profile_id,achievement_id,coins)
 values(actor,achievement_id,entitlement)
 on conflict on constraint coin_achievement_collections_pkey do update set coins=excluded.coins,collected_at=now()
 where c.coins<excluded.coins;
 update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
 return private.avatar_wallet(actor);
end $$;
revoke all on function public.collect_coin_achievement(text) from public,anon;
grant execute on function public.collect_coin_achievement(text) to authenticated;

-- Preserve collection marks when an admin merges duplicate employee records.
alter function public.merge_employees(text,text,text,text) set schema private;
alter function private.merge_employees(text,text,text,text) rename to merge_employees_before_coin_collection;
revoke all on function private.merge_employees_before_coin_collection(text,text,text,text) from public,anon,authenticated;
create function public.merge_employees(primary_id text,duplicate_id text,requested_name text,requested_branch text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if primary_id=duplicate_id then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.profiles where id in (primary_id,duplicate_id) order by id for update;
 insert into private.coin_achievement_collections as c(profile_id,achievement_id,coins)
 select primary_id,achievement_id,coins from private.coin_achievement_collections where profile_id=duplicate_id
 on conflict(profile_id,achievement_id) do update set coins=c.coins+excluded.coins;
 perform private.merge_employees_before_coin_collection(primary_id,duplicate_id,requested_name,requested_branch);
end $$;
revoke all on function public.merge_employees(text,text,text,text) from public,anon;
grant execute on function public.merge_employees(text,text,text,text) to authenticated;

update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.rank_achievements(text,timestamp with time zone)') is null then execute $release$


-- Replay only positive-review events. Manual balance edits, employee transfers,
-- name ordering and other employees' deactivations cannot create an award.
-- Equal balances share the trailing position until a balance is strictly higher.
create function private.rank_achievements(profile text, asof timestamptz default now())
returns table(id text,title text,period text,coins numeric,stars numeric)
language sql stable security definer set search_path='' as $$
 with accounts as materialized (
  select p.id,coalesce((p.data#>>'{manualStats,monthReviews}')::numeric,0) initial
  from public.profiles p where p.data->>'role'='employee' and not private.employee_is_disabled(p.id)
 ), moments as materialized (
  select distinct r.occurred_at at_time,date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh' month_start
  from public.reviews r where profile=any(r.employee_ids) and r.rating>=4
  and r.occurred_at>=timestamptz '2026-11-01 00:00:00+03'
  and r.occurred_at<least(asof,now())
 ), balances as materialized (
  select m.*,a.id,
   round(a.initial+coalesce(c.before_credit,0),1) before_balance,
   round(a.initial+coalesce(c.after_credit,0),1) after_balance
  from moments m cross join accounts a
  cross join lateral (
   select sum(1.0/cardinality(r.employee_ids)) filter(where r.occurred_at<m.at_time) before_credit,
    sum(1.0/cardinality(r.employee_ids)) after_credit
   from public.reviews r where a.id=any(r.employee_ids) and r.rating>=4
   and r.occurred_at>=m.month_start and r.occurred_at<=m.at_time
  ) c
 ), transitions as (
  select own.at_time,own.month_start,
   1+count(*) filter(where peer.id<>profile and peer.before_balance>=own.before_balance) before_rank,
   1+count(*) filter(where peer.id<>profile and peer.after_balance>=own.after_balance) after_rank,
   max(peer.after_balance) leader_balance
  from balances own join balances peer on peer.at_time=own.at_time
  where own.id=profile and own.after_balance>own.before_balance
  group by own.at_time,own.month_start
 ), reached as (
  select distinct t.month_start,destination
  from transitions t cross join lateral generate_series(greatest(1,t.after_rank)::integer,least(10,t.before_rank-1)::integer) destination
  where t.after_rank<t.before_rank and
   (t.at_time>=t.month_start+interval '10 days' or t.leader_balance>=20)
 )
 select 'rank:'||to_char(month_start at time zone 'Asia/Riyadh','YYYY-MM')||':'||destination,
  'التقدم إلى المركز '||destination,to_char(month_start at time zone 'Asia/Riyadh','YYYY-MM'),
  round(90*power(1.1::numeric,10-destination),2),round(90*power(1.1::numeric,10-destination),2)
 from reached;
$$;
revoke all on function private.rank_achievements(text,timestamptz) from public,anon,authenticated;

create function private.rank_challenge(profile text, asof timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 instant timestamptz:=least(asof,now()); own_balance numeric; current_rank integer;
 target record; destination integer; amount numeric; enabled boolean;
begin
 select balance into own_balance from private.employee_scores(instant) s
 join public.profiles p on p.id=s.profile_id
 where s.profile_id=profile and p.data->>'role'='employee' and not private.employee_is_disabled(p.id);
 if own_balance is null then return null; end if;
 select extract(day from instant at time zone 'Asia/Riyadh')>10 or coalesce(max(s.balance),0)>=20 into enabled
 from private.employee_scores(instant) s join public.profiles p on p.id=s.profile_id
 where p.data->>'role'='employee' and not private.employee_is_disabled(p.id);
 if not enabled then return jsonb_build_object('active',false); end if;
 select 1+count(*) into current_rank from private.employee_scores(instant) s
 join public.profiles p on p.id=s.profile_id
 where p.data->>'role'='employee' and not private.employee_is_disabled(p.id)
 and p.id<>profile and s.balance>=own_balance;
 if current_rank=1 then return jsonb_build_object('active',true,'leading',true,'rank',1); end if;
 if current_rank>11 then
  select p.id,p.data->>'name' name,p.branch,s.balance into target
  from private.employee_scores(instant) s join public.profiles p on p.id=s.profile_id
  where p.data->>'role'='employee' and not private.employee_is_disabled(p.id) and p.id<>profile
  order by s.balance desc,p.data->>'name',p.id offset 9 limit 1;
 else
  select p.id,p.data->>'name' name,p.branch,s.balance into target
  from private.employee_scores(instant) s join public.profiles p on p.id=s.profile_id
  where p.data->>'role'='employee' and not private.employee_is_disabled(p.id)
  and p.id<>profile and s.balance>=own_balance
  order by s.balance,p.data->>'name',p.id limit 1;
 end if;
 if target.id is null then return jsonb_build_object('active',true,'rank',current_rank); end if;
 select 1+count(*) into destination from private.employee_scores(instant) s join public.profiles p on p.id=s.profile_id
 where p.data->>'role'='employee' and not private.employee_is_disabled(p.id)
 and p.id<>profile and s.balance>target.balance;
 select coalesce(sum(round(90*power(1.1::numeric,10-r),2)),0) into amount
 from generate_series(destination,least(10,current_rank-1)) r
 where not exists(select 1 from private.rank_achievements(profile,instant) a
  where a.id='rank:'||to_char(instant at time zone 'Asia/Riyadh','YYYY-MM')||':'||r);
 return jsonb_build_object('active',true,'rank',current_rank,'targetId',target.id,'targetName',target.name,
  'targetBranch',target.branch,'targetRank',destination,'coins',amount,'stars',amount,'alreadyEarned',amount=0);
end $$;
revoke all on function private.rank_challenge(text,timestamptz) from public,anon,authenticated;

alter function private.employee_progression(text,date) rename to progression_before_rank_challenge;
revoke all on function private.progression_before_rank_challenge(text,date) from public,anon,authenticated;
create function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language sql stable security definer set search_path='' as $$
 with prior as (select private.progression_before_rank_challenge(profile,cutoff) value),
 awards as (select coalesce(sum(coins),0) coins,coalesce(sum(stars),0) stars
  from private.rank_achievements(profile,(cutoff+1)::timestamp at time zone 'Asia/Riyadh'))
 select value||jsonb_build_object('coins',(value->>'coins')::numeric+coins,'stars',(value->>'stars')::numeric+stars)
 from prior cross join awards;
$$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;

-- The previous collector's residual already sees the new progression. Remove
-- rank coins from that residual before exposing them as individual achievements.
alter function private.coin_achievements(text) rename to coin_achievements_before_rank;
revoke all on function private.coin_achievements_before_rank(text) from public,anon,authenticated;
create function private.coin_achievements(profile text) returns table(id text,title text,period text,coins numeric)
language sql stable security definer set search_path='' as $$
 with awards as materialized (select * from private.rank_achievements(profile))
 select a.id,a.title,a.period,
  case when a.id='branch-and-tier' then greatest(0,a.coins-(select coalesce(sum(r.coins),0) from awards r)) else a.coins end
 from private.coin_achievements_before_rank(profile) a
 union all select a.id,a.title,a.period,a.coins from awards a;
$$;
revoke all on function private.coin_achievements(text) from public,anon,authenticated;

alter function private.avatar_wallet(text) rename to avatar_wallet_before_rank;
revoke all on function private.avatar_wallet_before_rank(text) from public,anon,authenticated;
create function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.avatar_wallet_before_rank(profile)||jsonb_build_object('rankChallenge',private.rank_challenge(profile));
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.tier_achievements(text,timestamp with time zone)') is null then execute $release$


-- Use the same score function as the actual tier badge. Include each score
-- event so a later negative review cannot erase an already reached tier.
create function private.tier_peak_points(profile text, requested_period date, asof timestamptz) returns numeric
language sql stable security definer set search_path='' as $$
 with limits as (
  select requested_period::timestamp at time zone 'Asia/Riyadh' starts,
   least(asof,(requested_period+interval '1 month') at time zone 'Asia/Riyadh') ends
 ), moments as (
  select l.ends at_time from limits l where l.ends>l.starts
  union select l.starts+interval '1 microsecond' from limits l where l.ends>l.starts
  union select r.occurred_at+interval '1 microsecond' from public.reviews r cross join limits l
   where r.employee_ids @> array[profile] and r.occurred_at>=l.starts and r.occurred_at<l.ends
  union select t.occurred_at+interval '1 microsecond' from public.timeline_events t cross join limits l
   where t.kind='gap' and t.employee_ids @> array[profile] and t.occurred_at>=l.starts and t.occurred_at<l.ends
 )
 select coalesce(max(s.points),0) from moments m cross join lateral private.employee_scores(m.at_time) s
 where s.profile_id=profile;
$$;
revoke all on function private.tier_peak_points(text,date,timestamptz) from public,anon,authenticated;

create function private.tier_achievements(profile text, asof timestamptz default now())
returns table(id text,title text,period text,tier text,coins numeric,stars numeric)
language sql stable security definer set search_path='' as $$
 with periods as (
  select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date month_start
  from public.reviews r where r.employee_ids @> array[profile]
   and r.occurred_at>=timestamptz '2026-11-01 00:00:00+03' and r.occurred_at<asof
  union select date_trunc('month',asof at time zone 'Asia/Riyadh')::date
   where asof>=timestamptz '2026-11-01 00:00:00+03'
  union select (split_part(c.achievement_id,':',2)||'-01')::date
   from private.coin_achievement_collections c where c.profile_id=profile
   and c.achievement_id ~ '^tier:[0-9]{4}-[0-9]{2}:(silver|gold)$'
   and (split_part(c.achievement_id,':',2)||'-01')::date<=(asof at time zone 'Asia/Riyadh')::date
 ), peaks as materialized (
  select month_start,private.tier_peak_points(profile,month_start,asof) points from periods
 )
 select 'tier:'||to_char(p.month_start,'YYYY-MM')||':'||t.tier,'بلوغ المرتبة '||t.label,
  to_char(p.month_start,'YYYY-MM'),t.tier,t.reward,t.reward
 from peaks p cross join (values ('silver','الفضية',8::numeric,100::numeric),('gold','الذهبية',11::numeric,250::numeric)) t(tier,label,target,reward)
 where p.points>=t.target;
$$;
revoke all on function private.tier_achievements(text,timestamptz) from public,anon,authenticated;

-- These are the old embedded tier bonuses; subtract them before adding the
-- new independent achievements. All other currencies and rank awards remain.
create function private.previous_tier_reward_totals(profile text, cutoff date) returns table(coins numeric,stars numeric)
language sql stable security definer set search_path='' as $$
 with periods as (
  select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date month_start
  from public.reviews r where r.employee_ids @> array[profile] and r.rating>=4
   and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-12-01' and cutoff
 ), peaks as materialized (
  select private.monthly_peak_score(profile,month_start,least((month_start+interval '1 month')::date,cutoff+1)) points from periods
 )
 select coalesce(sum((case when points>=8 then 30 else 0 end)+(case when points>=11 then 50 else 0 end)),0)::numeric,
  coalesce(sum((case when points>=8 then 25 else 0 end)+(case when points>=11 then 40 else 0 end)),0)::numeric from peaks;
$$;
revoke all on function private.previous_tier_reward_totals(text,date) from public,anon,authenticated;

alter function private.employee_progression(text,date) rename to progression_before_tier_missions;
revoke all on function private.progression_before_tier_missions(text,date) from public,anon,authenticated;
create function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language sql stable security definer set search_path='' as $$
 with prior as (select private.progression_before_tier_missions(profile,cutoff) value),
 old as (select * from private.previous_tier_reward_totals(profile,cutoff)),
 achievements as materialized (select * from private.tier_achievements(profile,
  case when cutoff=(now() at time zone 'Asia/Riyadh')::date then now() else (cutoff+1)::timestamp at time zone 'Asia/Riyadh' end)),
 awards as (select coalesce(sum(coins),0) coins,coalesce(sum(stars),0) stars,
  case when bool_or(tier='gold') then 'gold' when bool_or(tier='silver') then 'silver' else 'bronze' end highest from achievements)
 select value||jsonb_build_object('coins',(value->>'coins')::numeric-old.coins+awards.coins,
  'stars',(value->>'stars')::numeric-old.stars+awards.stars,'highestTier',awards.highest)
 from prior cross join old cross join awards;
$$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;

alter function private.coin_achievements(text) rename to coin_achievements_before_tier_missions;
revoke all on function private.coin_achievements_before_tier_missions(text) from public,anon,authenticated;
create function private.coin_achievements(profile text) returns table(id text,title text,period text,coins numeric)
language sql stable security definer set search_path='' as $$
 with awards as materialized (select * from private.tier_achievements(profile))
 select a.id,a.title,a.period,case when a.id='branch-and-tier'
  then greatest(0,a.coins-(select coalesce(sum(t.coins),0) from awards t)) else a.coins end
 from private.coin_achievements_before_tier_missions(profile) a
 union all select a.id,a.title,a.period,a.coins from awards a;
$$;
revoke all on function private.coin_achievements(text) from public,anon,authenticated;

create function private.employee_tier_missions(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with period as (select date_trunc('month',now() at time zone 'Asia/Riyadh')::date month_start),
 peak as (select private.tier_peak_points(profile,month_start,now()) points from period),
 missions as (
  select 'tier:'||to_char(p.month_start,'YYYY-MM')||':'||t.tier id,t.tier,t.target,t.reward,
   least(t.target,greatest(0,k.points)) progress_value,k.points>=t.target completed
  from period p cross join peak k cross join (values ('silver',8::numeric,100::numeric),('gold',11::numeric,250::numeric)) t(tier,target,reward)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tier',m.tier,'target',m.target,'current',m.progress_value,
  'coins',m.reward,'stars',m.reward,'completed',m.completed,'collected',coalesce(c.coins,0)>=m.reward) order by m.target),'[]')
 from missions m left join private.coin_achievement_collections c on c.profile_id=profile and c.achievement_id=m.id;
$$;
revoke all on function private.employee_tier_missions(text) from public,anon,authenticated;

alter function private.avatar_wallet(text) rename to avatar_wallet_before_tier_missions;
revoke all on function private.avatar_wallet_before_tier_missions(text) from public,anon,authenticated;
create function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.avatar_wallet_before_tier_missions(profile)||jsonb_build_object('tierMissions',private.employee_tier_missions(profile));
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.progression_before_daily_two_update(text,date)') is null then execute $release$
-- Update the original daily sea award inside the existing progression chain.
-- Keep eligibility, subsequent rank/tier awards, and existing ACLs unchanged.
do $migration$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('private.progression_before_rank_challenge(text,date)'::regprocedure);
 if position('coins:=coins+sea_count*10;' in definition)=0
 or position('stars:=stars+sea_count*10;' in definition)=0 then
  raise exception 'Unrecognized daily sea progression; refusing to change rewards';
 end if;
 updated:=replace(replace(definition,'coins:=coins+sea_count*10;','coins:=coins+sea_count*25;'),
  'stars:=stars+sea_count*10;','stars:=stars+sea_count*20;');
 execute updated;

 definition:=pg_get_functiondef('private.coin_achievements_before_rank(text)'::regprocedure);
 if position('sea_coins:=private.sea_daily_completed_days(profile,cutoff)*10;' in definition)=0 then
  raise exception 'Unrecognized daily sea collection; refusing to change rewards';
 end if;
 execute replace(definition,'sea_coins:=private.sea_daily_completed_days(profile,cutoff)*10;',
  'sea_coins:=private.sea_daily_completed_days(profile,cutoff)*25;');
end $migration$;

revoke all on function private.progression_before_rank_challenge(text,date) from public,anon,authenticated;
revoke all on function private.coin_achievements_before_rank(text) from public,anon,authenticated;

-- Keep earlier days and every later grade unchanged.
alter function private.graded_review_progression(text,date) rename to progression_before_daily_two_update;
revoke all on function private.progression_before_daily_two_update(text,date) from public,anon,authenticated;
create function private.graded_review_progression(profile text, cutoff date) returns jsonb
language sql stable security definer set search_path='' as $$
 with old as (select private.progression_before_daily_two_update(profile,cutoff) value),
 days as (select count(*) n from (
  select (r.occurred_at at time zone 'Asia/Riyadh')::date as reward_day from public.reviews r
  where profile=any(r.employee_ids) and r.rating>=4
  and (r.occurred_at at time zone 'Asia/Riyadh')::date between date '2026-11-12' and cutoff
  group by 1 having count(*)>=2
 ) completed)
 select value||jsonb_build_object('stars',(value->>'stars')::numeric+n*8,'coins',(value->>'coins')::numeric+n*10) from old cross join days;
$$;
revoke all on function private.graded_review_progression(text,date) from public,anon,authenticated;
do $$ declare definition text; begin
 select pg_get_functiondef(coalesce(to_regprocedure('private.coin_achievements_before_rank(text)'),to_regprocedure('private.coin_achievements(text)'))) into definition;
 if position('round(5*power(2.25::numeric,g.n-1),2)' in definition)=0 then raise exception 'Unexpected daily coin calculation'; end if;
 definition:=replace(definition,'round(5*power(2.25::numeric,g.n-1),2)',
  'case when g.n=1 and to_char(r.occurred_at at time zone ''Asia/Riyadh'',''YYYY-MM-DD'')>=''2026-11-12'' then 15::numeric else round(5*power(2.25::numeric,g.n-1),2) end');
 execute definition;
end $$;


-- Apply the revised partnership tiers to calculations from the update onward.
do $$ declare definition text; begin
 select pg_get_functiondef('private.progression_before_daily_two_update(text,date)'::regprocedure) into definition;
 if position('partnerships>=(array[2,4,6])[grade] then round(10*multiplier,2)' in definition)=0
 or position('partnerships>=(array[2,4,6])[grade] then round(15*multiplier,2)' in definition)=0 then
  raise exception 'Unexpected partnership progression';
 end if;
 definition:=replace(definition,'partnerships>=(array[2,4,6])[grade] then round(10*multiplier,2)',
 'partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade] then round((case when cutoff>=date ''2026-11-12'' then 88 else 10 end)*multiplier,2)');
 definition:=replace(definition,'partnerships>=(array[2,4,6])[grade] then round(15*multiplier,2)',
 'partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade] then round((case when cutoff>=date ''2026-11-12'' then 98 else 15 end)*multiplier,2)');
 execute definition;
 select pg_get_functiondef(coalesce(to_regprocedure('private.coin_achievements_before_rank(text)'),to_regprocedure('private.coin_achievements(text)'))) into definition;
 if position('''partner'',''ثنائي متألق'',10::numeric,partnerships>=(array[2,4,6])[grade]' in definition)=0 then
  raise exception 'Unexpected partnership coin entitlement';
 end if;
 definition:=replace(definition,'''partner'',''ثنائي متألق'',10::numeric,partnerships>=(array[2,4,6])[grade]',
 '''partner'',''ثنائي متألق'',case when cutoff>=date ''2026-11-12'' then 88::numeric else 10::numeric end,partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade]');
 execute definition;
end $$;

$release$; end if; end $compat$;
do $compat$ begin if to_regprocedure('private.coffee_reward_entitlements(text)') is null then execute $release$

create function private.coffee_reward_entitlements(profile text)
returns table(id text,branch text,period date,eligible boolean)
language sql stable security definer set search_path='' as $$
 select 'coffee:'||b.branch||':'||b.period,b.branch,b.period,5<=(
  select count(*) from public.reviews r where r.branch=b.branch and r.rating>=4 and profile=any(r.employee_ids)
  and r.occurred_at>=b.period::timestamp at time zone 'Asia/Riyadh'
  and r.occurred_at<(b.period+interval '1 month') at time zone 'Asia/Riyadh'
  and r.occurred_at<=now()
 ) from private.earned_branch_badges((now() at time zone 'Asia/Riyadh')::date) b where b.badge='coffee';
$$;
revoke all on function private.coffee_reward_entitlements(text) from public,anon,authenticated;
alter function private.coin_achievements(text) rename to coin_achievements_before_coffee;
revoke all on function private.coin_achievements_before_coffee(text) from public,anon,authenticated;
create function private.coin_achievements(profile text) returns table(id text,title text,period text,coins numeric)
language sql stable security definer set search_path='' as $$
 with coffee as (select * from private.coffee_reward_entitlements(profile) where eligible),
 old as (select * from private.coin_achievements_before_coffee(profile))
 select a.id,a.title,a.period,case when a.id='branch-and-tier' then greatest(0,a.coins-(select count(*)*125 from coffee)) else a.coins end from old a
 union all select c.id,'قهوة الأحد · '||c.branch,to_char(c.period,'YYYY-MM'),125::numeric from coffee c;
$$;
revoke all on function private.coin_achievements(text) from public,anon,authenticated;
-- Transfer already collected coffee from its former aggregate, without changing available balances.
with coffee as (
 select p.id profile_id,c.id from public.profiles p cross join lateral private.coffee_reward_entitlements(p.id) c
 join private.coin_achievement_collections old on old.profile_id=p.id and old.achievement_id='branch-and-tier'
 where c.eligible and old.coins>=(select coalesce(sum(a.coins),0) from private.coin_achievements_before_coffee(p.id) a where a.id='branch-and-tier')
)
insert into private.coin_achievement_collections(profile_id,achievement_id,coins) select profile_id,id,125 from coffee on conflict do nothing;
update private.coin_achievement_collections c set coins=greatest(0,c.coins-paid.coins)
from (select profile_id,sum(coins) coins from private.coin_achievement_collections where achievement_id like 'coffee:%' group by profile_id) paid
where c.profile_id=paid.profile_id and c.achievement_id='branch-and-tier';
alter function private.avatar_wallet(text) rename to avatar_wallet_before_coffee;
revoke all on function private.avatar_wallet_before_coffee(text) from public,anon,authenticated;
create function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.avatar_wallet_before_coffee(profile)||jsonb_build_object('coffeeRewards',(
  select coalesce(jsonb_agg(jsonb_build_object('branch',c.branch,'period',c.period,'eligible',c.eligible,
   'collected',c.eligible and coalesce(p.coins,0)>=125)),'[]'::jsonb)
  from private.coffee_reward_entitlements(profile) c left join private.coin_achievement_collections p on p.profile_id=profile and p.achievement_id=c.id
 ));
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;

$release$; end if; end $compat$;


do $integrity$ begin
 if exists(select 1 from release_catalog_integrity old where old.collections is distinct from
 (select md5(string_agg(id::text||':'||price::text||':'||enabled::text,',' order by id)) from public.avatar_collections)
 or old.variants is distinct from (select md5(string_agg(id::text||':'||price_adjustment::text||':'||enabled::text,',' order by id)) from public.avatar_variants)
 or old.purchases is distinct from (select md5(string_agg(variant_id::text||':'||profile_id||':'||price_paid::text,',' order by variant_id)) from public.avatar_purchases))
 then raise exception 'Catalog or purchase history changed; rolling back release'; end if;
end $integrity$;
commit;
