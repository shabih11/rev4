begin;
insert into public.branches(id,data) values ('badge-test','{"id":"badge-test","name":"Badge test","start":"16:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) values
 ('badge-admin','{"id":"badge-admin","name":"Admin","role":"admin","branch":"badge-test"}'),
 ('badge-employee','{"id":"badge-employee","name":"Employee","role":"employee","branch":"badge-test"}');
insert into auth.users(id,email) values
 ('60000000-0000-4000-8000-000000000001','badge-admin@example.invalid'),
 ('60000000-0000-4000-8000-000000000002','badge-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('60000000-0000-4000-8000-000000000001','badge-admin','admin',null),
 ('60000000-0000-4000-8000-000000000002','badge-employee','employee','badge-test');
-- No reviews: administrator selection is the sole milestone criterion.
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.approve_branch_badge_reward('badge-test','milestone',array['badge-employee']); raise exception 'Employee approved reward'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('badge.before',private.employee_progression('badge-employee')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.approve_branch_badge_reward('badge-test','milestone500',array[]::text[]); raise exception 'Empty recipients accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.approve_branch_badge_reward('badge-test','milestone500',array['badge-admin']); raise exception 'Nonemployee recipient accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.approve_branch_badge_reward('badge-test','milestone500',array['badge-employee','badge-employee']); raise exception 'Duplicate recipients accepted'; exception when invalid_parameter_value then null; end;
end $$;
select public.approve_branch_badge_reward('badge-test','milestone500',array['badge-employee']);
select public.approve_branch_badge_reward('badge-test','milestone500',array['badge-employee']);
do $$ begin
 begin perform public.approve_branch_badge_reward('badge-test','rocket',array['badge-employee']); raise exception 'Manual task award allowed'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ declare before jsonb:=current_setting('badge.before')::jsonb; after jsonb:=private.employee_progression('badge-employee'); begin
 if (after->>'coins')::numeric-(before->>'coins')::numeric<>1000 or after->>'stars' is distinct from before->>'stars' then raise exception '500 reward must be exactly 1000 coins without stars'; end if;
end $$;
select set_config('badge.before',private.employee_progression('badge-employee')::text,true);
set local role authenticated;
select public.approve_branch_badge_reward('badge-test','milestone',array['badge-employee']);
select public.approve_branch_badge_reward('badge-test','milestone',array['badge-employee']);
reset role;
do $$ declare before jsonb:=current_setting('badge.before')::jsonb; after jsonb:=private.employee_progression('badge-employee'); begin
 if (after->>'coins')::numeric-(before->>'coins')::numeric<>10000 or after->>'stars' is distinct from before->>'stars' then raise exception '1000 reward must be exactly 10000 coins without stars'; end if;
end $$;
rollback;
