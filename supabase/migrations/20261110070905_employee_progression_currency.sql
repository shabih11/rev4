begin;
-- Historical currency, but level progression starts permanently on 2026-11-01 (Riyadh).
-- Derived once per distinct review / period: refreshes never mint additional credit.
create function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 period date; stars numeric:=0; coins numeric:=0; remaining numeric; lvl integer; cost numeric; band integer;
 positives integer; days integer; partnerships integer; partners integer; daily_count integer; shares numeric; recovery numeric;
 month_coins numeric; month_stars numeric;
 daily_targets integer[]:=array[2,3,4,5]; ten_targets integer[]:=array[10,20,35,50];
 days_targets integer[]:=array[5,8,12,16]; partner_targets integer[]:=array[2,4,6,8];
 daily_rewards integer[]:=array[5,10,15,20]; ten_coins integer[]:=array[25,60,110,175]; ten_stars integer[]:=array[30,75,140,225];
 days_coins integer[]:=array[20,40,70,110]; days_stars integer[]:=array[25,50,90,140];
 partner_coins integer[]:=array[10,25,45,70]; partner_stars integer[]:=array[15,35,60,90];
 team_coins integer[]:=array[15,25,40,60]; team_stars integer[]:=array[20,35,55,80];
begin
 for period in
  select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date
  from public.reviews r where profile=any(r.employee_ids) and (r.occurred_at at time zone 'Asia/Riyadh')::date<=cutoff order by 1
 loop
  remaining:=stars; lvl:=1; cost:=50;
  while remaining>=cost loop remaining:=remaining-cost; lvl:=lvl+1; cost:=round(10*power(1.25::numeric,lvl-1))*5; end loop;
  band:=case when period<date '2026-11-01' then 1 else least(4,1+(lvl-1)/3) end;
  select count(*) filter(where r.rating>=4),count(distinct (r.occurred_at at time zone 'Asia/Riyadh')::date) filter(where r.rating>=4),
   coalesce(sum(1.0/cardinality(r.employee_ids)) filter(where r.rating>=4),0)
  into positives,days,shares from public.reviews r where profile=any(r.employee_ids)
   and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date=period and (r.occurred_at at time zone 'Asia/Riyadh')::date<=cutoff;
  select count(*),coalesce(max(n),0) into partners,partnerships from (
   select member,count(*) n from public.reviews r cross join lateral unnest(r.employee_ids) member
   where profile=any(r.employee_ids) and member<>profile and r.rating>=4
    and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date=period and (r.occurred_at at time zone 'Asia/Riyadh')::date<=cutoff group by member
  ) p;
  select count(*) into daily_count from (
   select (r.occurred_at at time zone 'Asia/Riyadh')::date from public.reviews r
   where profile=any(r.employee_ids) and r.rating>=4
    and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date=period and (r.occurred_at at time zone 'Asia/Riyadh')::date<=cutoff
   group by 1 having count(*)>=daily_targets[band]
  ) d;
  select 4.0/cardinality(r.employee_ids) into recovery from public.reviews r
   where profile=any(r.employee_ids) and r.rating<=2
    and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date=period and (r.occurred_at at time zone 'Asia/Riyadh')::date<=cutoff
   order by (r.occurred_at at time zone 'Asia/Riyadh')::date,r.id limit 1;
  month_coins:=daily_count*daily_rewards[band]
   +case when positives>=ten_targets[band] then ten_coins[band] else 0 end
   +case when days>=days_targets[band] then days_coins[band] else 0 end
   +case when partnerships>=partner_targets[band] then partner_coins[band] else 0 end
   +case when partners>=3 then team_coins[band] else 0 end
   +case when recovery is not null and greatest(0,shares-20)+0.000000001>=recovery then 20 else 0 end;
  month_stars:=daily_count*daily_rewards[band]
   +case when positives>=ten_targets[band] then ten_stars[band] else 0 end
   +case when days>=days_targets[band] then days_stars[band] else 0 end
   +case when partnerships>=partner_targets[band] then partner_stars[band] else 0 end
   +case when partners>=3 then team_stars[band] else 0 end
   +case when recovery is not null and greatest(0,shares-20)+0.000000001>=recovery then 25 else 0 end;
  coins:=coins+positives*5+month_coins;
  if period>=date '2026-11-01' then stars:=stars+positives*5+month_stars; end if;
 end loop;
 return jsonb_build_object('coins',coins,'stars',stars);
end $$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;

create or replace function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (select (private.employee_progression(profile)->>'coins')::numeric total),
 spending as (select coalesce(sum(price_paid),0) total from (
  select price_paid from public.avatar_purchases where profile_id=profile
  union all select price_paid from public.gem_purchases where profile_id=profile
 ) p)
 select jsonb_build_object('earned',e.total,'spent',s.total,'available',greatest(0,e.total-s.total)) from earnings e cross join spending s;
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;

-- Extend the existing purchase implementation without replacing its conflict,
-- locking, ownership and expected-price protections.
do $$ declare definition text; guard text := E' funds:=(private.avatar_wallet(actor)'; begin
 definition:=pg_get_functiondef('public.purchase_avatar(uuid,numeric)'::regprocedure);
 if strpos(definition,guard)=0 then raise exception 'Purchase balance guard missing'; end if;
 definition:=replace(definition,guard,E' -- Eligibility is checked from current server scores, never from a client claim.\n if (settings->>''tiers'')::boolean is distinct from true or not exists(\n  select 1 from private.employee_scores() s where s.profile_id=actor\n   and s.points>=greatest(8,(settings->>''silverAt'')::numeric)\n ) then raise exception ''Silver tier required'' using errcode=''42501''; end if;\n' || guard);
 execute definition;
end $$;

-- Preserve premium custom prices and all past paid prices / ownership.
with prices as (
 select id,least(4,dense_rank() over(order by price))::integer grade from public.avatar_collections where price<300
)
update public.avatar_collections c set price=(array[300,500,800,1200])[p.grade] from prices p where p.id=c.id;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
