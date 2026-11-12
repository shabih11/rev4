begin;
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
commit;
