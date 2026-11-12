begin;

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
commit;
