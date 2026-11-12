begin;
insert into public.branches(id,data) values('presence-test','{"id":"presence-test","name":"Presence test","start":"10:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name',id,'branch','presence-test','role',role) from (values
 ('presence-active','employee'),('presence-expired','employee'),('presence-disabled','employee'),('presence-manager','manager'),('presence-viewer','viewer')) p(id,role);
insert into auth.users(id,email) values
 ('72000000-0000-4000-8000-000000000001','presence-active@example.invalid'),
 ('72000000-0000-4000-8000-000000000002','presence-expired@example.invalid'),
 ('72000000-0000-4000-8000-000000000003','presence-disabled@example.invalid'),
 ('72000000-0000-4000-8000-000000000004','presence-manager@example.invalid'),
 ('72000000-0000-4000-8000-000000000005','presence-viewer@example.invalid');
insert into public.user_access(uid,profile_id,role,branch,disabled) values
 ('72000000-0000-4000-8000-000000000001','presence-active','employee','presence-test',false),
 ('72000000-0000-4000-8000-000000000002','presence-expired','employee','presence-test',false),
 ('72000000-0000-4000-8000-000000000003','presence-disabled','employee','presence-test',true),
 ('72000000-0000-4000-8000-000000000004','presence-manager','manager','presence-test',false),
 ('72000000-0000-4000-8000-000000000005','presence-viewer','viewer',null,false);
insert into private.employee_page_presence(user_id,last_seen_at) values
 ('72000000-0000-4000-8000-000000000001',now()-interval '4 minutes'),
 ('72000000-0000-4000-8000-000000000002',now()-interval '5 minutes'),
 ('72000000-0000-4000-8000-000000000003',now()),
 ('72000000-0000-4000-8000-000000000004',now());
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select public.record_employee_page_presence();
reset role;
update private.employee_page_presence set last_seen_at=now()-interval '1 second' where user_id='72000000-0000-4000-8000-000000000005';
set local role authenticated;
do $$ begin if not public.get_online_employees() ? 'presence-viewer' then raise exception 'Viewer cannot read presence'; end if; end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare result jsonb:=public.get_online_employees(); begin
 if not result ? 'presence-viewer' or not result ? 'presence-active' or not result ? 'presence-expired' or not result ? 'presence-manager' or result ? 'presence-disabled' then raise exception 'Presence filtering failed'; end if;
 if (result->>'presence-active')::timestamptz<>now()+interval '1 minute' then raise exception 'Presence expiry mismatch'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.get_online_employees(); raise exception 'Disabled account allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if not public.get_online_employees() ? 'presence-active' then raise exception 'Manager cannot read presence'; end if;
end $$;
reset role;
insert into public.profiles(id,data) values ('presence-admin',jsonb_build_object('id','presence-admin','name','Admin test','role','admin','branch','presence-test'));
insert into auth.users(id,email) values ('72000000-0000-4000-8000-000000000006','presence-admin@example.invalid');
insert into public.user_access(uid,profile_id,role) values ('72000000-0000-4000-8000-000000000006','presence-admin','admin');
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
set local role authenticated;
select public.record_employee_page_presence();
reset role;
update private.employee_page_presence set last_seen_at=now()-interval '1 second' where user_id='72000000-0000-4000-8000-000000000006';
set local role authenticated;
do $$ declare result jsonb:=public.get_online_employees(); begin
 if not result ? 'presence-admin' or not result ? 'presence-active' then raise exception 'Admin cannot read employee presence'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.get_online_employees(); raise exception 'Anonymous allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
