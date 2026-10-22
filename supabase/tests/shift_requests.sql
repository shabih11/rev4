-- Local, synthetic fixtures only. Every change is rolled back.
begin;
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name','Verification','branch',branch,'role',role,'imageUrl','','points',0,'reviewsCount',0,'stats','{}'::jsonb)
from (values ('request-admin','جاليري','admin'),('request-manager','جاليري','manager'),('request-employee','جاليري','employee'),('request-other','شرق','employee')) p(id,branch,role);
insert into auth.users(id,email) values
 ('20000000-0000-4000-8000-000000000001','request-admin@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','request-manager@example.invalid'),
 ('20000000-0000-4000-8000-000000000003','request-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('20000000-0000-4000-8000-000000000001','request-admin','admin',null),
 ('20000000-0000-4000-8000-000000000002','request-manager','manager','جاليري'),
 ('20000000-0000-4000-8000-000000000003','request-employee','employee','جاليري');
insert into public.reviews(id,data) values ('request-review',jsonb_build_object('id','request-review','branch','جاليري','rating','5','date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','11:00','linkedEmployeeIds','[]'::jsonb));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare draft jsonb; yesterday jsonb; touched integer; begin
 draft:=jsonb_build_object('id','request-a','branch','جاليري','type','gap','title','طلب تسجيل شفت مفقود','date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','10:00','employees',jsonb_build_array(jsonb_build_object('id','request-employee','name','Spoofed name')),'createdBy',auth.uid()::text,'requestedShift','first','requestStatus','pending');
 insert into public.timeline_events(id,data) values('request-a',draft);
 if (select data->'employees'->0->>'name' from public.timeline_events where id='request-a')<>'Verification' then raise exception 'Requester name spoofing'; end if;
 begin
  insert into public.timeline_events(id,data) values('request-copy',draft||'{"id":"request-copy"}');
  raise exception 'Duplicate request allowed';
 exception when unique_violation then null; end;
 begin
  insert into public.timeline_events(id,data) values('request-old',draft||jsonb_build_object('id','request-old','date',to_char((now() at time zone 'Asia/Riyadh')::date-3,'DD-MM-YYYY')));
  raise exception 'Old request allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.timeline_events(id,data) values('request-future',draft||jsonb_build_object('id','request-future','date',to_char((now() at time zone 'Asia/Riyadh')::date+1,'DD-MM-YYYY')));
  raise exception 'Future request allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.timeline_events(id,data) values('request-forged',draft||'{"id":"request-forged","requestStatus":"accepted"}');
  raise exception 'Self approval on insert';
 exception when insufficient_privilege then null; end;
 update public.timeline_events set data=data||'{"requestStatus":"accepted"}' where id='request-a';
 get diagnostics touched=row_count;
 if touched<>0 then raise exception 'Employee approved request'; end if;
 begin
  insert into public.management_contact(id,phone) values('administration','966500000000');
  raise exception 'Employee wrote contact';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.employee_merge_requests(branch,primary_id,duplicate_id,name,target_branch) values('جاليري','request-employee','request-other','Verification','جاليري');
  raise exception 'Employee created merge request';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare before_record jsonb; begin
 begin
  update public.timeline_events set data=data||'{"requestStatus":"accepted"}' where id='request-a';
  set constraints shift_request_approval immediate;
  raise exception 'Approval without shift allowed';
 exception when check_violation then null; end;
 select data into before_record from public.timeline_events where id='request-a';
 perform public.write_rows('timeline',jsonb_build_array(
   jsonb_build_object('id','request-a','before',before_record,'after',before_record||'{"requestStatus":"accepted"}'),
   jsonb_build_object('id','request-shift','before',null,'after',jsonb_build_object('id','request-shift','branch','جاليري','type','shift','title','Verification','date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','10:00','endTime','16:00','employees',jsonb_build_array(jsonb_build_object('id','request-employee','name','Verification'))))));
 set constraints shift_request_approval immediate;
 if not exists(select 1 from public.reviews where id='request-review' and data->>'linkedShiftId'='request-shift' and employee_ids=array['request-employee']) then raise exception 'Approval did not relink review'; end if;
 perform public.register_branch_employee('Verification new','جاليري');
 if not exists(select 1 from public.profiles where data->>'name'='Verification new' and branch='جاليري') then raise exception 'Manager creation failed'; end if;
 begin
  perform public.register_branch_employee('Verification outside','شرق');
  raise exception 'Manager created cross-branch profile';
 exception when insufficient_privilege then null; end;
 insert into public.employee_merge_requests(branch,primary_id,duplicate_id,name,target_branch) values('جاليري','request-employee','request-other','Verification','جاليري');
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.timeline_events(id,data) values ('request-rejected',jsonb_build_object('id','request-rejected','branch','جاليري','type','gap','title','طلب تسجيل شفت مفقود','date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','16:00','employees',jsonb_build_array(jsonb_build_object('id','request-employee','name','Verification')),'createdBy',auth.uid()::text,'requestedShift','second','requestStatus','pending'));
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.timeline_events set data=data||'{"requestStatus":"rejected","rejectedAt":0}' where id='request-rejected';
do $$ begin
 if not exists(select 1 from public.timeline_events where id='request-rejected' and (data->>'rejectedAt')::bigint>extract(epoch from now()-interval '1 minute')*1000) then raise exception 'Server rejection timestamp missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.management_contact(id,phone) values('administration','966500000000');
update public.employee_merge_requests set status='rejected';
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select phone from public.management_contact where id='administration')<>'966500000000' then raise exception 'Member contact read failed'; end if;
 if exists(select 1 from public.employee_merge_requests) then raise exception 'Private merge requests leaked'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.merge_employees_with_coverage('request-employee','request-other','Verification','جاليري',false);
do $$ begin
 if not exists(select 1 from public.profiles where id='request-employee' and data->'isCoverage'='false'::jsonb and data->'assignedBranches' ? 'شرق') then raise exception 'Removing coverage lost historical branch assignment'; end if;
end $$;
insert into public.profiles(id,data) values('coverage-duplicate',jsonb_build_object('id','coverage-duplicate','name','Verification','branch','جاليري','role','employee','imageUrl','','points',0,'reviewsCount',0,'stats','{}'::jsonb));
select public.merge_employees_with_coverage('request-employee','coverage-duplicate','Verification','جاليري',true);
do $$ begin
 if not exists(select 1 from public.profiles where id='request-employee' and data->'isCoverage'='true'::jsonb) then raise exception 'Adding coverage failed'; end if;
end $$;
rollback;
