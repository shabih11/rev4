begin;
insert into public.branches(id,data) values ('sim-branch','{"id":"sim-branch","name":"Simulation","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('sim-admin','{"id":"sim-admin","name":"Admin","role":"admin","branch":"sim-branch"}'),
 ('sim-employee','{"id":"sim-employee","name":"Employee","role":"employee","branch":"sim-branch"}'),
 ('sim-manager','{"id":"sim-manager","name":"Manager","role":"manager","branch":"sim-branch"}');
insert into auth.users(id,email) values
 ('30000000-0000-4000-8000-000000000001','sim-admin@example.invalid'),
 ('30000000-0000-4000-8000-000000000002','sim-employee@example.invalid'),
 ('30000000-0000-4000-8000-000000000003','sim-manager@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('30000000-0000-4000-8000-000000000001','sim-admin','admin',null),
 ('30000000-0000-4000-8000-000000000002','sim-employee','employee','sim-branch'),
 ('30000000-0000-4000-8000-000000000003','sim-manager','manager','sim-branch');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"sim-auth-session"}',true);
do $$ declare started jsonb; sid uuid; result jsonb; begin
 started:=public.start_simulation('sim-employee'); sid:=(started->>'id')::uuid;
 perform set_config('test.simulation',sid::text,true);
 result:=public.simulation_read(sid,'get_my_account');
 if result->>'id'<>'sim-employee' or result->>'role'<>'employee' or result ? 'email' or result ? 'username' then raise exception 'Target identity leaked or missing'; end if;
 if auth.uid()<>'30000000-0000-4000-8000-000000000001'::uuid then raise exception 'Actor identity not restored'; end if;
 perform public.simulation_read(sid,'get_read_model');
 perform public.simulation_read(sid,'get_employee_features');
 perform public.simulation_read(sid,'read_rows','{"source":"branches","all_rows":true}');
 begin perform public.simulation_read(sid,'write_rows','{"source":"timeline","changes":[]}'); raise exception 'Mutation allowed'; exception when insufficient_privilege then null; end;
 begin perform public.simulation_read(sid,'record_employee_page_presence'); raise exception 'Presence allowed'; exception when insufficient_privilege then null; end;
 begin perform public.simulation_read(sid,'get_accounts'); raise exception 'Admin data allowed'; exception when insufficient_privilege then null; end;
 -- Switching closes the previous context and keeps actor identity unchanged.
 started:=public.start_simulation('sim-manager');
 begin perform public.simulation_read(sid,'get_my_account'); raise exception 'Old simulation still active'; exception when insufficient_privilege then null; end;
 sid:=(started->>'id')::uuid;
 result:=public.simulation_read(sid,'get_my_account');
 if result->>'role'<>'manager' then raise exception 'Manager simulation failed'; end if;
 perform public.stop_simulation(sid);
 begin perform public.simulation_read(sid,'get_my_account'); raise exception 'Closed simulation allowed'; exception when insufficient_privilege then null; end;
 started:=public.start_simulation('sim-employee');
 perform set_config('test.simulation',(started->>'id'),true);
end $$;
-- A stolen id is unusable from another authentication session or user.
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"other-session"}',true);
do $$ begin
 begin perform public.simulation_read(current_setting('test.simulation')::uuid,'get_my_account'); raise exception 'Cross session allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"sim-auth-session"}',true);
do $$ begin
 begin perform public.start_simulation('sim-manager'); raise exception 'Employee simulation allowed'; exception when insufficient_privilege then null; end;
 begin perform public.simulation_read(current_setting('test.simulation')::uuid,'get_my_account'); raise exception 'Other actor allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.admin_simulations; raise exception 'Audit exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Membership revocation is checked on every read, without waiting for token refresh.
update public.user_access set disabled=true where profile_id='sim-employee';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"sim-auth-session"}',true);
do $$ begin
 begin perform public.simulation_read(current_setting('test.simulation')::uuid,'get_my_account'); raise exception 'Disabled target allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.user_access set disabled=false where profile_id='sim-employee';
-- Expiration is checked on every read.
update private.admin_simulations set expires_at=now()-interval '1 minute' where id=current_setting('test.simulation')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"sim-auth-session"}',true);
do $$ begin
 begin perform public.simulation_read(current_setting('test.simulation')::uuid,'get_my_account'); raise exception 'Expired simulation allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.admin_simulation_reads r join private.admin_simulations s on s.id=r.simulation_id where s.actor='30000000-0000-4000-8000-000000000001') then raise exception 'Audit missing'; end if;
 if exists(select 1 from private.employee_page_presence where user_id='30000000-0000-4000-8000-000000000002') then raise exception 'Simulation counted as employee presence'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.simulation_targets(); raise exception 'Anonymous access allowed'; exception when insufficient_privilege then null; end;
 begin perform public.simulation_read(current_setting('test.simulation')::uuid,'get_my_account'); raise exception 'Anonymous simulation allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
