-- Preserve the installed progression rules and replace only the former sea award.
do $migration$
declare definition text; cleaned text;
begin
 if to_regprocedure('private.progression_before_sea_daily(text,date)') is not null then
   raise exception 'Sea daily reward migration already installed';
 end if;
 definition:=pg_get_functiondef('private.employee_progression(text,date)'::regprocedure);
 if position('sea_count' in definition)>0 then
   cleaned:=regexp_replace(definition,'select count\(\*\) into sea_count[\s\S]*?stars:=stars\+sea_count\*5;','sea_count:=0;','i');
   if cleaned=definition then raise exception 'Unrecognized previous sea reward; refusing to double award'; end if;
   definition:=cleaned;
 end if;
 definition:=replace(definition,'FUNCTION private.employee_progression(','FUNCTION private.progression_before_sea_daily(');
 execute definition;
end $migration$;
revoke all on function private.progression_before_sea_daily(text,date) from public,anon,authenticated;

create function private.sea_daily_completed_days(profile text, cutoff date) returns integer
language sql stable security definer set search_path='' as $$
 with member as (
   select p.* from public.profiles p where p.id=profile and p.data->>'role'='employee'
 ), calendar as (
   select day,date '2026-11-01'+(day-1) as date,
   case when day<=15 then 2 when day<=25 then 3 else 4 end as target
   from generate_series(5,30) day where date '2026-11-01'+(day-1)<=cutoff
 ), branches(name,opening) as (
   values ('جاليري',14),('القصر',14),('المملكة',10),('سلام',10),('ذافيو',12),('شرق',7)
 ), windows as (
   select c.*,b.name,
   (c.date+make_time(case when extract(dow from c.date)=5 then 14 else b.opening end,0,0)) at time zone 'Asia/Riyadh' as starts,
   (c.date+1+make_time(case when extract(dow from c.date+1)=5 then 14 else b.opening end,0,0)) at time zone 'Asia/Riyadh' as ends,
   least(now(),(cutoff+1)::timestamp at time zone 'Asia/Riyadh') as asof
   from calendar c cross join branches b
 ), eligible as (
   select w.*,case when m.data->>'isCoverage'='true' then (
     select t.branch from public.timeline_events t where t.kind='shift' and profile=any(t.employee_ids)
     and t.occurred_at<=least(w.ends,w.asof) order by t.occurred_at desc,t.id desc limit 1
   ) else m.branch end as member_branch
   from windows w cross join member m where w.starts<w.asof
 )
 select count(distinct day)::integer from eligible e
 where e.name=case e.member_branch when 'الرياض جاليري' then 'جاليري' when 'القصر مول' then 'القصر' when 'شرق بلازا' then 'شرق' else e.member_branch end
 and (exists(select 1 from public.sea_mission_completions c where c.branch=e.name and c.day=e.day and c.approved_at<e.asof)
 or e.target<=(select count(*) from public.reviews r where r.rating>=4
   and r.branch=any(array[e.name,case e.name when 'جاليري' then 'الرياض جاليري' when 'القصر' then 'القصر مول' when 'شرق' then 'شرق بلازا' else e.name end])
   and r.occurred_at>=e.starts and r.occurred_at<least(e.ends,e.asof)));
$$;
revoke all on function private.sea_daily_completed_days(text,date) from public,anon,authenticated;

create or replace function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language sql stable security definer set search_path='' as $$
 select legacy || jsonb_build_object(
   'coins',coalesce((legacy->>'coins')::numeric,0)+completed*10,
   'stars',coalesce((legacy->>'stars')::numeric,0)+completed*10)
 from (select private.progression_before_sea_daily(profile,cutoff) as legacy,
   private.sea_daily_completed_days(profile,cutoff) as completed) rewards;
$$;
revoke all on function private.employee_progression(text,date) from public,anon,authenticated;
