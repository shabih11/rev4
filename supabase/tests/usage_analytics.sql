begin;
insert into public.branches(id,data) values ('usage-test','{"id":"usage-test","name":"Test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('usage-admin','{"id":"usage-admin","name":"Test admin","role":"admin","branch":"usage-test"}'),
 ('usage-employee','{"id":"usage-employee","name":"Test employee","role":"employee","branch":"usage-test"}'),
 ('usage-manager','{"id":"usage-manager","name":"Test manager","role":"manager","branch":"usage-test"}');
insert into auth.users(id,email) values
 ('90000000-0000-4000-8000-000000000001','usage-admin@example.invalid'),
 ('90000000-0000-4000-8000-000000000002','usage-employee@example.invalid'),
 ('90000000-0000-4000-8000-000000000003','usage-manager@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('90000000-0000-4000-8000-000000000001','usage-admin','admin',null),
 ('90000000-0000-4000-8000-000000000002','usage-employee','employee','usage-test'),
 ('90000000-0000-4000-8000-000000000003','usage-manager','manager','usage-test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.record_usage_batch('[{"id":"91000000-0000-4000-8000-000000000001","session":"92000000-0000-4000-8000-000000000001","kind":"page_view","page":"dashboard","seconds":0,"action":""},{"id":"91000000-0000-4000-8000-000000000002","session":"92000000-0000-4000-8000-000000000001","kind":"active","page":"dashboard","seconds":15,"action":""}]','usage-employee');
-- Duplicate delivery is safe.
select public.record_usage_batch('[{"id":"91000000-0000-4000-8000-000000000001","session":"92000000-0000-4000-8000-000000000001","kind":"page_view","page":"dashboard","seconds":0,"action":""}]','usage-employee');
do $$ begin
 begin perform public.get_usage_report(7); raise exception 'Employee read report'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.usage_events; raise exception 'Direct read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.record_usage_batch('[{"id":"91000000-0000-4000-8000-000000000003","session":"92000000-0000-4000-8000-000000000001","kind":"click","page":"dashboard","seconds":0,"action":"navigation","email":"private@example.invalid"}]','usage-employee'); raise exception 'Sensitive metadata accepted'; exception when raise_exception then if sqlerrm='Sensitive metadata accepted' then raise; end if; end;
 begin perform public.record_usage_batch('[{"id":"91000000-0000-4000-8000-000000000003","session":"92000000-0000-4000-8000-000000000001","kind":"active","page":"dashboard","seconds":999,"action":""}]','usage-employee'); raise exception 'Unbounded time accepted'; exception when check_violation then null; end;
 begin perform public.record_usage_login_failure('test'); raise exception 'Client forged failure'; exception when insufficient_privilege then null; end;
 begin perform public.record_usage_login(); raise exception 'Sessionless login accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.get_usage_report(7); raise exception 'Manager read report'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r:=public.get_usage_report(7,'usage-employee','usage-test');
 if (r->'employees'->0->>'events')::int<>2 or (r->'employees'->0->>'active_seconds')::int<>15 or (r->'employees'->0->>'sessions')::int<>1 then raise exception 'Aggregation/dedup failed'; end if;
 if jsonb_array_length(r->'pages')<>1 then raise exception 'Page aggregation failed'; end if;
 if (r->'employees'->0->>'logins')::int<>0 then raise exception 'Visit counted as login'; end if;
 r:=public.get_usage_report(7,null,'no-such-branch');
 if jsonb_array_length(r->'employees')<>0 then raise exception 'Branch filter ignored'; end if;
end $$;
reset role;
update public.user_access set disabled=true where profile_id='usage-employee';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.record_usage_batch('[]','usage-employee'); raise exception 'Disabled account wrote events'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.user_access set disabled=false where profile_id='usage-employee';
insert into auth.sessions(id,user_id,created_at,updated_at) values('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',now(),now());
insert into private.account_usernames(uid,username) values('90000000-0000-4000-8000-000000000002','usage-test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',true);
select public.record_usage_login();
select public.record_usage_login();
do $$ begin
 begin perform public.record_usage_batch('[]','usage-admin'); raise exception 'Account switch misattributed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_usage_login_failure('usage-test');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r:=public.get_usage_report(7,'usage-employee','usage-test');
 if (r->'employees'->0->>'logins')::int<>1 or (r->'employees'->0->>'failed_logins')::int<>1 then raise exception 'Login dedup or failure logging failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.record_usage_batch('[]','usage-employee'); raise exception 'Anonymous wrote events'; exception when insufficient_privilege then null; end;
 begin perform public.get_usage_report(7); raise exception 'Anonymous report access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.sensitive_audit where entity='user_access' and operation='UPDATE' and recorded_at>=now()) then raise exception 'Sensitive audit missing'; end if;
end $$;
rollback;
