-- Run in one transaction and roll back; never provisions lasting accounts.
begin;
-- Isolated branches prevent overlap with real shifts; every fixture is rolled back.
insert into public.branches(id,data) select id,jsonb_build_object('id',id,'name',id,'start','16:00','end','23:00','nextDayTime','10:00') from (values ('verify-branch-a'),('verify-branch-b')) b(id);
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name','Verification','branch',branch,'role',role,'imageUrl','','points',0,'reviewsCount',0,'stats','{}'::jsonb) from (values
 ('verify-admin','verify-branch-a','admin'),('verify-manager','verify-branch-a','manager'),('verify-employee','verify-branch-a','employee'),('verify-other','verify-branch-b','employee')) p(id,branch,role);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','rev4-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','rev4-manager@example.invalid'),
 ('00000000-0000-4000-8000-000000000003','rev4-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('00000000-0000-4000-8000-000000000001','verify-admin','admin',null),
 ('00000000-0000-4000-8000-000000000002','verify-manager','manager','verify-branch-a'),
 ('00000000-0000-4000-8000-000000000003','verify-employee','employee','verify-branch-a');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.result_problem_reports(id,category,description,results_period) values
 ('10000000-0000-4000-8000-000000000001','appeal',repeat('س',70),'2026-10-01'),
 ('10000000-0000-4000-8000-000000000002','manipulation','بلاغ اختبار','2026-10-01');
insert into public.result_problem_reports(id,category,target_employee_id,description,results_period) values
 ('10000000-0000-4000-8000-000000000003','verify_employee','verify-other','طلب تحقق','2026-10-01');
do $$ begin
 if exists(select 1 from public.result_problem_reports) then raise exception 'Employee can read reports'; end if;
 begin insert into public.result_problem_reports(id,category,description,results_period) values(gen_random_uuid(),'appeal',repeat('س',71),'2026-10-01'); raise exception 'Overlong description accepted'; exception when check_violation then null; end;
 begin insert into public.result_problem_reports(id,category,description,results_period) values(gen_random_uuid(),'appeal',E'\n\t','2026-10-01'); raise exception 'Blank description accepted'; exception when check_violation then null; end;
 begin insert into public.result_problem_reports(id,category,description,results_period) values(gen_random_uuid(),'verify_employee','اختبار','2026-10-01'); raise exception 'Missing target accepted'; exception when check_violation then null; end;
 begin insert into public.result_problem_reports(id,category,target_employee_id,description,results_period) values(gen_random_uuid(),'verify_employee','verify-employee','اختبار','2026-10-01'); raise exception 'Own target accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.result_problem_reports(id,category,target_employee_id,description,results_period) values(gen_random_uuid(),'verify_employee','verify-admin','اختبار','2026-10-01'); raise exception 'Nonemployee target accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.result_problem_reports(id,reporter_uid,category,description,results_period) values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','appeal','اختبار','2026-10-01'); raise exception 'Reporter spoof accepted'; exception when insufficient_privilege then null; end;
 begin update public.result_problem_reports set description='تغيير'; raise exception 'Report editing accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.result_problem_reports; raise exception 'Report deletion accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.result_problem_reports) then raise exception 'Branch manager can read reports'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.result_problem_reports where id::text like '10000000-%')<>3 then raise exception 'Admin read failed'; end if;
 if not exists(select 1 from public.result_problem_reports where id='10000000-0000-4000-8000-000000000001' and reporter_profile_id='verify-employee' and reporter_uid='00000000-0000-4000-8000-000000000003') then raise exception 'Reporter identity incorrect'; end if;
end $$;
reset role;
update public.user_access set disabled=true where profile_id='verify-employee';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin insert into public.result_problem_reports(id,category,description,results_period) values(gen_random_uuid(),'appeal','اختبار','2026-10-01'); raise exception 'Disabled account submitted'; exception when insufficient_privilege or not_null_violation then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.result_problem_reports; raise exception 'Anonymous read accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.result_problem_reports(id,category,description,results_period) values(gen_random_uuid(),'appeal','اختبار','2026-10-01'); raise exception 'Anonymous submission accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
