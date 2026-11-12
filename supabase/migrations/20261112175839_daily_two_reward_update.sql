begin;
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
commit;
