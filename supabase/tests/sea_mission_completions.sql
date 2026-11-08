begin;
insert into public.branches(id,data) values ('sea-test-branch','{"id":"sea-test-branch","name":"Sea test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('sea-test-admin','{"id":"sea-test-admin","name":"Sea admin","role":"admin","branch":"sea-test-branch"}'),
 ('sea-test-manager','{"id":"sea-test-manager","name":"Sea manager","role":"manager","branch":"sea-test-branch"}'),
 ('sea-test-employee','{"id":"sea-test-employee","name":"Sea employee","role":"employee","branch":"sea-test-branch"}');
insert into auth.users(id,email) values
 ('20000000-0000-4000-8000-000000000001','sea-admin@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','sea-manager@example.invalid'),
 ('20000000-0000-4000-8000-000000000003','sea-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('20000000-0000-4000-8000-000000000001','sea-test-admin','admin',null),
 ('20000000-0000-4000-8000-000000000002','sea-test-manager','manager','sea-test-branch'),
 ('20000000-0000-4000-8000-000000000003','sea-test-employee','employee','sea-test-branch');
-- Reset only inside this isolated, rolled-back fixture transaction.
delete from public.sea_mission_completions;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.sea_mission_completions(branch,day) values ('شرق',5);
do $$ begin
 if (select count(*) from public.sea_mission_completions where branch='شرق' and day=5)<>1 then raise exception 'Admin approval missing'; end if;
 begin
  insert into public.sea_mission_completions(branch,day) values ('شرق',4);
  raise exception 'Invalid day accepted';
 exception when check_violation then null; end;
 begin
  insert into public.sea_mission_completions(branch,day,approved_at) values ('سلام',5,now());
  raise exception 'Approval time spoof allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.sea_mission_completions set day=6 where branch='شرق';
  raise exception 'Immutable approval changed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.sea_mission_completions)<>1 then raise exception 'Member read failed'; end if;
 begin
  insert into public.sea_mission_completions(branch,day) values ('سلام',5);
  raise exception 'Manager approved boat';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin
  insert into public.sea_mission_completions(branch,day) values ('سلام',5);
  raise exception 'Employee approved boat';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.sea_mission_completions)<>0 then raise exception 'Nonmember read approvals'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform branch from public.sea_mission_completions;
  raise exception 'Anonymous read approvals';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
