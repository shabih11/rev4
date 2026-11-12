begin;
-- Stress two years of persisted schedules; fixtures never survive the transaction.
do $$ declare week date; before_count integer; begin
 for i in 0..103 loop
  week:=date '2030-01-07'+i*7;
  perform private.plan_owner_presence_week(week);
 end loop;
 select count(*) into before_count from private.owner_presence_sessions;
 perform private.plan_owner_presence_week(date '2030-01-07');
 if (select count(*) from private.owner_presence_sessions)<>before_count then raise exception 'Planning is not idempotent'; end if;
 if exists(select 1 from private.owner_presence_sessions group by (starts_at at time zone 'Asia/Riyadh')::date having count(*)>3) then raise exception 'Daily visit cap exceeded'; end if;
 if exists(select 1 from private.owner_presence_sessions where ends_at-starts_at>interval '10 minutes' group by date_trunc('week',starts_at at time zone 'Asia/Riyadh') having count(*)>1) then raise exception 'Weekly long visit cap exceeded'; end if;
 if exists(select 1 from private.owner_presence_sessions a join private.owner_presence_sessions b on a.starts_at<b.starts_at and a.ends_at>b.starts_at) then raise exception 'Visits overlap'; end if;
 if exists(select 1 from private.owner_presence_sessions where (starts_at at time zone 'Asia/Riyadh')::time>=time '01:00' and (starts_at at time zone 'Asia/Riyadh')::time<time '09:00') then raise exception 'Overnight visit'; end if;
 if (select count(distinct (starts_at at time zone 'Asia/Riyadh')::time) from private.owner_presence_sessions where starts_at>='2030-01-07')<100 then raise exception 'Insufficient time variation'; end if;
 if not exists(select 1 from generate_series(date '2030-01-07',date '2031-12-31',interval '1 day') d where not exists(select 1 from private.owner_presence_sessions s where (s.starts_at at time zone 'Asia/Riyadh')::date=d::date)) then raise exception 'No days off generated'; end if;
 if has_function_privilege('anon','public.get_owner_presence_settings()','EXECUTE') or has_function_privilege('authenticated','private.plan_owner_presence_week(date)','EXECUTE') then raise exception 'Unexpected public permission'; end if;
 begin perform public.set_owner_presence_enabled(true); raise exception 'Unauthenticated setting allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
