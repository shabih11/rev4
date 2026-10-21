-- Run in one transaction and roll back; never provisions lasting accounts.
begin;
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name','Verification','branch',branch,'role',role,'imageUrl','','points',0,'reviewsCount',0,'stats','{}'::jsonb) from (values
 ('verify-admin','جاليري','admin'),('verify-manager','جاليري','manager'),('verify-employee','جاليري','employee'),('verify-other','شرق','employee')) p(id,branch,role);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','rev4-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','rev4-manager@example.invalid'),
 ('00000000-0000-4000-8000-000000000003','rev4-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('00000000-0000-4000-8000-000000000001','verify-admin','admin',null),
 ('00000000-0000-4000-8000-000000000002','verify-manager','manager','جاليري'),
 ('00000000-0000-4000-8000-000000000003','verify-employee','employee','جاليري');
insert into public.reviews(id,data) select id,jsonb_build_object('id',id,'branch','جاليري','rating','3','date','21-10-2026','time',clock,'linkedEmployeeIds','[]'::jsonb) from (values ('verify-before','15:59'),('verify-boundary','16:00'),('verify-overnight','02:00')) r(id,clock);
insert into public.reviews(id,data) values ('verify-next-day','{"id":"verify-next-day","branch":"جاليري","rating":"5","date":"22-10-2026","time":"13:59","linkedEmployeeIds":[]}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.write_rows('timeline',jsonb_build_array(jsonb_build_object('id','verify-shift','before',null,'after',jsonb_build_object('id','verify-shift','branch','جاليري','type','shift','title','Verification','date','21-10-2026','time','16:00','endDate','22-10-2026','endTime','14:00','employees',jsonb_build_array(jsonb_build_object('id','verify-employee','name','Verification'))))));
do $$ begin
 if (select data->>'linkedShiftId' from public.reviews where id='verify-boundary') is distinct from 'verify-shift' then raise exception 'Boundary review was not linked'; end if;
 if (select data->>'linkedShiftId' from public.reviews where id='verify-next-day') is distinct from 'verify-shift' then raise exception 'Overnight review was not linked'; end if;
 if (select cardinality(employee_ids) from public.reviews where id='verify-before')<>0 then raise exception 'Previous shift boundary leaked'; end if;
 if (select data->>'linkedShiftId' from public.reviews where id='verify-overnight')='verify-shift' then raise exception 'Wrong business day linked'; end if;
 begin perform public.get_accounts(); raise exception 'Manager can read private accounts'; exception when insufficient_privilege then null; end;
 begin insert into public.user_access(uid,profile_id,role) values('00000000-0000-4000-8000-000000000002','verify-other','admin'); raise exception 'Manager can grant roles'; exception when insufficient_privilege then null; end;
 begin perform public.write_rows('timeline','[{"id":"verify-invalid-member","before":null,"after":{"id":"verify-invalid-member","branch":"جاليري","type":"shift","title":"Verification","date":"21-10-2026","time":"14:00","endTime":"16:00","employees":[{"id":"verify-other","name":"Verification"}]}}]'); raise exception 'Cross-branch membership accepted'; exception when foreign_key_violation then null; end;
 begin perform public.write_rows('timeline','[{"id":"verify-overlap","before":null,"after":{"id":"verify-overlap","branch":"جاليري","type":"shift","title":"Verification","date":"21-10-2026","time":"17:00","endTime":"18:00","employees":[{"id":"verify-employee","name":"Verification"}]}}]'); raise exception 'Overlapping shift accepted'; exception when exclusion_violation then null; end;
 begin perform public.write_rows('timeline','[{"id":"verify-shift","before":null,"after":null}]'); raise exception 'Old write accepted'; exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"role":"admin"}}',true);
do $$ begin
 if private.account_role()<>'employee' then raise exception 'User metadata granted a role'; end if;
 if (select count(*) from public.reviews where id like 'verify-%')<>4 then raise exception 'Shared employee review read failed'; end if;
 if public.get_read_model()::text like '%example.invalid%' then raise exception 'Summary exposed account emails'; end if;
 begin perform public.get_accounts(); raise exception 'Employee can read private accounts'; exception when insufficient_privilege then null; end;
 begin perform public.write_rows('users',jsonb_build_array(jsonb_build_object('id','verify-employee','before',(select data from public.profiles where id='verify-employee'),'after',(select data||'{"role":"admin"}'::jsonb from public.profiles where id='verify-employee')))); raise exception 'Employee elevated own role'; exception when insufficient_privilege then null; end;
end $$;
select public.rename_me('Updated verification','Verification');
do $$ begin
 if (select data->>'name' from public.profiles where id='verify-employee')<>'Updated verification' then raise exception 'Own name update failed'; end if;
 begin perform public.merge_employees('verify-employee','verify-other','Verification','جاليري'); raise exception 'Employee can merge identities'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.timeline_events(id,data) values('verify-other-shift','{"id":"verify-other-shift","branch":"شرق","type":"shift","title":"Verification","date":"21-10-2026","time":"16:00","endTime":"17:00","employees":[{"id":"verify-other","name":"Verification"}]}');
insert into public.reviews(id,data) values('verify-other-review','{"id":"verify-other-review","branch":"شرق","rating":"5","date":"21-10-2026","time":"16:30","linkedEmployeeIds":[]}');
select public.merge_employees('verify-employee','verify-other','Merged verification','جاليري');
do $$ begin
 if exists(select 1 from public.profiles where id='verify-other') then raise exception 'Duplicate remains after merge'; end if;
 if exists(select 1 from public.reviews where 'verify-other'=any(employee_ids)) or exists(select 1 from public.timeline_events where 'verify-other'=any(employee_ids)) then raise exception 'Merge left orphan identities'; end if;
 if (select employee_ids from public.reviews where id='verify-other-review')<>array['verify-employee'] then raise exception 'Merge lost credits'; end if;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Simulate an importer holding an obsolete empty assignment snapshot.
update public.reviews set data=(data-'linkedShiftId')||'{"linkedEmployeeIds":[],"comment":"Source edit"}'::jsonb where id='verify-boundary';
do $$ begin
 if (select data->>'linkedShiftId' from public.reviews where id='verify-boundary') is distinct from 'verify-shift' then raise exception 'Source edit overwrote current assignments'; end if;
end $$;
update public.reviews set data=jsonb_set(data,'{time}','"15:59"'::jsonb) where id='verify-boundary';
do $$ begin
 if (select cardinality(employee_ids) from public.reviews where id='verify-boundary')<>0 then raise exception 'Changed source time retained invalid assignments'; end if;
end $$;
update public.reviews set data=jsonb_set(data,'{time}','"16:00"'::jsonb) where id='verify-boundary';
do $$ begin
 if (select data->>'linkedShiftId' from public.reviews where id='verify-boundary') is distinct from 'verify-shift' then raise exception 'Changed source time did not relink'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.profiles)<>0 then raise exception 'Account without membership sees directory'; end if;
 begin perform public.get_accounts(); raise exception 'Missing membership leaked accounts'; exception when insufficient_privilege then null; end;
 begin perform public.get_read_model(); raise exception 'Missing membership leaked summary'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_read_model(); raise exception 'Anonymous summary access'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.reviews limit 1; raise exception 'Anonymous review access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin perform private.record_day('31-02-2026'); raise exception 'Invalid date accepted'; exception when datetime_field_overflow then null; end;
 if private.record_at('21-10-2026','16:00')<>timestamptz '2026-10-21 13:00:00Z' then raise exception 'Riyadh timezone incorrect'; end if;
end $$;
select 'RLS, roles, privacy, conflicts, shift boundaries and Riyadh dates verified' as verification;
rollback;
