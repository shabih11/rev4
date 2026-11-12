begin;

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
commit;
