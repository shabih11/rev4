-- All accounts, identifiers and branch fixtures are removed by the final rollback.
begin;
insert into public.branches(id,data) select id,jsonb_build_object('id',id,'name',id,'start','16:00','end','23:00','nextDayTime','10:00') from (values ('verify-login-a'),('verify-login-b')) b(id);
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name','Verification','branch',branch,'role',role) from (values
 ('verify-login-manager','verify-login-a','manager'),('verify-login-employee','verify-login-a','employee'),('verify-login-viewer','','viewer'),('verify-login-admin','','admin')) p(id,branch,role);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000011','verify-login-manager@example.invalid'),
 ('00000000-0000-4000-8000-000000000012','verify-login-employee@example.invalid'),
 ('00000000-0000-4000-8000-000000000013','verify-login-viewer@example.invalid'),
 ('00000000-0000-4000-8000-000000000014','verify-login-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000015','verify-login-new@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('00000000-0000-4000-8000-000000000011','verify-login-manager','manager','verify-login-a'),
 ('00000000-0000-4000-8000-000000000012','verify-login-employee','employee','verify-login-a'),
 ('00000000-0000-4000-8000-000000000013','verify-login-viewer','viewer',null),
 ('00000000-0000-4000-8000-000000000014','verify-login-admin','admin',null);
update auth.users set encrypted_password=extensions.crypt((select decrypted_secret from vault.decrypted_secrets where name='employee_default_password'),extensions.gen_salt('bf')) where id in ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000015');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated","user_metadata":{"role":"admin"}}',true);
do $$ begin
 if public.get_my_account()->'mustChangePassword' is distinct from 'true'::jsonb or public.get_my_account()->'mustSetUsername' is distinct from 'true'::jsonb then raise exception 'Default setup flags incorrect'; end if;
 begin perform private.password_is_default('00000000-0000-4000-8000-000000000012'); raise exception 'Private password helper exposed'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.account_usernames; raise exception 'Private usernames exposed'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_username_login('verify.user.20261029','test'); raise exception 'Username address resolver exposed'; exception when insufficient_privilege then null; end;
 begin perform public.complete_branch_registration('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000015','employee-00000000-0000-4000-8000-000000000015','Verification','verify-login-a'); raise exception 'Client can provision accounts'; exception when insufficient_privilege then null; end;
 begin perform public.set_my_username('admin'); raise exception 'Reserved username accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.set_my_username('bad@email.invalid'); raise exception 'Email accepted as username'; exception when invalid_parameter_value then null; end;
end $$;
select public.set_my_username(' Verify.User.20261029 ');
do $$ begin
 if public.get_my_account()->>'username' is distinct from 'verify.user.20261029' or public.get_my_account()->'mustSetUsername' is distinct from 'false'::jsonb then raise exception 'Username not saved to own account'; end if;
 if public.get_my_account()->'mustChangePassword' is distinct from 'true'::jsonb then raise exception 'Username change bypassed password requirement'; end if;
 if public.get_read_model()::text like '%verify.user.20261029%' then raise exception 'Username leaked through leaderboard'; end if;
 begin perform public.set_my_username('verify.changed'); raise exception 'Chosen username changed again'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_my_username('verify.user.20261029'); raise exception 'Duplicate username accepted'; exception when unique_violation then null; end;
end $$;
select public.set_my_username('verify.viewer.20261029');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000014","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from public.get_accounts() account where account->>'id'='verify-login-employee' and account->>'username'='verify.user.20261029' and account->>'email'='verify-login-employee@example.invalid') then raise exception 'Admin cannot see employee sign-in data'; end if;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare resolved text; denied_count integer:=0; begin
 resolved:=public.resolve_username_login('verify.user.20261029','synthetic-ip');
 if resolved is distinct from 'verify-login-employee@example.invalid' then raise exception 'Username resolved incorrect account'; end if;
 if public.resolve_username_login('verify.missing.20261029','synthetic-ip') is not null then raise exception 'Unknown username invented an account'; end if;
 for i in 1..20 loop
  begin perform public.resolve_username_login('verify.user.20261029','synthetic-ip'); exception when program_limit_exceeded then denied_count:=denied_count+1; end;
 end loop;
 if denied_count=0 then raise exception 'Username login rate limit missing'; end if;
 begin perform public.complete_branch_registration('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000015','employee-00000000-0000-4000-8000-000000000015','Verification','verify-login-b'); raise exception 'Registration accepted a forged branch'; exception when insufficient_privilege then null; end;
 begin perform public.complete_branch_registration('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000015','employee-00000000-0000-4000-8000-000000000015','Verification','verify-login-a'); raise exception 'Registration accepted employee actor'; exception when insufficient_privilege then null; end;
end $$;
select public.complete_branch_registration('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000015','employee-00000000-0000-4000-8000-000000000015','Verification','verify-login-a');
reset role;
do $$ begin
 if (select branch from public.profiles where id='employee-00000000-0000-4000-8000-000000000015') is distinct from 'verify-login-a' or (select branch from public.user_access where uid='00000000-0000-4000-8000-000000000015') is distinct from 'verify-login-a' then raise exception 'Registered profile/access branch mismatch'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000015","role":"authenticated"}',true);
do $$ begin
 if public.get_my_account()->'mustSetUsername' is distinct from 'true'::jsonb or public.get_my_account()->'mustChangePassword' is distinct from 'true'::jsonb then raise exception 'New employee bypassed setup'; end if;
end $$;
select public.set_my_username('verify.new.20261029');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 begin perform public.finish_self_account_setup('00000000-0000-4000-8000-000000000015'); raise exception 'Default password setup marked complete'; exception when insufficient_privilege then null; end;
 if not public.branch_registration_exists('00000000-0000-4000-8000-000000000011','employee-00000000-0000-4000-8000-000000000015') then raise exception 'Registration retry lost committed account'; end if;
end $$;
reset role;
update auth.users set encrypted_password=extensions.crypt('synthetic-changed-password',extensions.gen_salt('bf')) where id='00000000-0000-4000-8000-000000000015';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.finish_self_account_setup('00000000-0000-4000-8000-000000000015');
reset role;
set local role anon;
do $$ begin
 begin perform public.set_my_username('verify.anon'); raise exception 'Anonymous username write'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_username_login('verify.user.20261029','test'); raise exception 'Anonymous address resolver exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
