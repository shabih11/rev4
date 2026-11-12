begin;

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
commit;
