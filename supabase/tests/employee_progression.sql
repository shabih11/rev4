-- Local / CI isolated stack only; never run against production.
begin;
insert into public.branches(id,data) values('progress-test-branch','{"id":"progress-test-branch","name":"Progress test","start":"16:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) values('progress-test-a','{"id":"progress-test-a","name":"Progress test","branch":"progress-test-branch","role":"employee"}');
insert into public.reviews(id,data)
 select 'progress-test-'||month||'-'||n,jsonb_build_object('id','progress-test-'||month||'-'||n,'branch','progress-test-branch','rating','5','date','08-'||month||'-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('progress-test-a'))
 from (values('10'),('11')) m(month) cross join generate_series(1,10) n;
do $$ declare result jsonb; begin
 result:=private.employee_progression('progress-test-a','2026-11-08');
 if (result->>'coins')::numeric<>160 or (result->>'stars')::numeric<>85 then raise exception 'Historical coins / November stars mismatch: %',result; end if;
 if private.employee_progression('progress-test-a','2026-12-01')<>result then raise exception 'Month reset discarded progress'; end if;
 if private.employee_progression('progress-test-a','2026-11-08')<>result then raise exception 'Refresh duplicated rewards'; end if;
 if (private.employee_progression('progress-test-a','2026-10-31')->>'stars')::numeric<>0 then raise exception 'Prelaunch stars awarded'; end if;
end $$;
-- Reach level four during November, retain its opening targets, raise December targets.
insert into public.reviews(id,data)
 select 'progress-extra-'||n,jsonb_build_object('id','progress-extra-'||n,'branch','progress-test-branch','rating','5','date','08-11-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('progress-test-a')) from generate_series(1,30) n;
insert into public.reviews(id,data)
 select 'progress-dec-'||n,jsonb_build_object('id','progress-dec-'||n,'branch','progress-test-branch','rating','4','date','01-12-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('progress-test-a')) from generate_series(1,20) n;
do $$ declare result jsonb; begin
 result:=private.employee_progression('progress-test-a','2026-12-02');
 -- October 80 coins; November 230 coins/235 stars; December band two 170 coins/185 stars.
 if (result->>'coins')::numeric<>480 or (result->>'stars')::numeric<>420 then raise exception 'Advanced rewards mismatch: %',result; end if;
 if has_function_privilege('authenticated','private.employee_progression(text,date)','execute') then raise exception 'Private progression exposed'; end if;
end $$;
rollback;
