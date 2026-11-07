begin;
-- Login identifiers are private: absent from shared profiles and leaderboard reads.
create table private.account_usernames (
 uid uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username=lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
 chosen boolean not null default false
);
alter table private.account_usernames enable row level security;
revoke all on private.account_usernames from public,anon,authenticated;
create table private.login_throttle(bucket text primary key, minute timestamptz not null, attempts integer not null);
alter table private.login_throttle enable row level security;
revoke all on private.login_throttle from public,anon,authenticated;

create function private.password_is_default(target uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare secret text; hash text;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='employee_default_password';
 if secret is null or length(secret)<6 then raise exception 'Credential configuration unavailable' using errcode='55000'; end if;
 select encrypted_password into hash from auth.users where id=target;
 if hash is null or hash='' then return false; end if;
 return coalesce(hash=extensions.crypt(secret,hash),false);
end $$;
revoke all on function private.password_is_default(uuid) from public,anon,authenticated;

create or replace function public.get_my_account() returns jsonb
language sql stable security definer set search_path='' as $$
 select p.data||jsonb_build_object('email',u.email,'role',a.role,'branch',coalesce(a.branch,''),
   'username',coalesce(n.username,''),'mustSetUsername',not coalesce(n.chosen,false),
   'mustChangePassword',private.password_is_default(a.uid))
 from public.user_access a join public.profiles p on p.id=a.profile_id join auth.users u on u.id=a.uid
 left join private.account_usernames n on n.uid=a.uid
 where a.uid=(select auth.uid()) and not a.disabled;
$$;
create or replace function public.get_accounts() returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.account_role() is distinct from 'admin' or auth.uid() is null then raise exception 'Admin required' using errcode='42501'; end if;
 return query select p.data||jsonb_build_object('email',coalesce(u.email,''),'username',coalesce(n.username,''))
 from public.profiles p left join public.user_access a on a.profile_id=p.id
 left join auth.users u on u.id=a.uid left join private.account_usernames n on n.uid=a.uid;
end $$;

create function public.set_my_username(requested_username text) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(trim(requested_username)); existing private.account_usernames;
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 if normalized is null or normalized !~ '^[a-z0-9][a-z0-9._-]{2,31}$' or normalized in ('admin','administrator','root','support') then raise exception 'Invalid username' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-username:'||auth.uid()::text,0));
 select * into existing from private.account_usernames where uid=auth.uid() for update;
 if found and existing.chosen and existing.username is distinct from normalized then raise exception 'Username already chosen' using errcode='42501'; end if;
 insert into private.account_usernames(uid,username,chosen) values(auth.uid(),normalized,true)
 on conflict(uid) do update set username=excluded.username,chosen=true;
end $$;
revoke all on function public.set_my_username(text) from public,anon;
grant execute on function public.set_my_username(text) to authenticated;

-- Used by the sign-in service only. It never returns an address to an anonymous browser.
create function public.resolve_username_login(requested_username text, client_fingerprint text) returns text
language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(trim(requested_username)); bucket_key text; attempt_count integer; result text;
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if normalized is null or normalized !~ '^[a-z0-9][a-z0-9._-]{2,31}$' or length(coalesce(client_fingerprint,''))>200 then return null; end if;
 foreach bucket_key in array array['name:'||encode(extensions.digest(normalized,'sha256'),'hex'),'ip:'||encode(extensions.digest(coalesce(client_fingerprint,'unknown'),'sha256'),'hex')] loop
  insert into private.login_throttle(bucket,minute,attempts) values(bucket_key,date_trunc('minute',now()),1)
  on conflict(bucket) do update set minute=excluded.minute,attempts=case when login_throttle.minute=excluded.minute then login_throttle.attempts+1 else 1 end
  returning attempts into attempt_count;
  if attempt_count>(case when bucket_key like 'name:%' then 15 else 100 end) then raise exception 'Login rate exceeded' using errcode='54000'; end if;
 end loop;
 delete from private.login_throttle where minute<now()-interval '1 hour';
 select u.email into result from private.account_usernames n join auth.users u on u.id=n.uid
 join public.user_access a on a.uid=u.id where n.username=normalized and not a.disabled;
 return result;
end $$;
revoke all on function public.resolve_username_login(text,text) from public,anon,authenticated;
grant execute on function public.resolve_username_login(text,text) to service_role;

-- The branch comes from live membership, never from the submitted form.
create function public.complete_branch_registration(actor_uid uuid, target_uid uuid, profile_id text, employee_name text, expected_branch text) returns void
language plpgsql security definer set search_path='' as $$
declare branch_name text;
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select branch into branch_name from public.user_access where uid=actor_uid and role='manager' and not disabled for share;
 if branch_name is null or branch_name is distinct from expected_branch or not exists(select 1 from public.branches where id=branch_name) then raise exception 'Branch manager required' using errcode='42501'; end if;
 if employee_name is null or profile_id is null or length(trim(employee_name)) not between 1 and 120 or profile_id !~ '^employee-[a-f0-9-]{36}$' or not exists(select 1 from auth.users where id=target_uid) then raise exception 'Invalid employee' using errcode='22023'; end if;
 insert into public.profiles(id,data) values(profile_id,jsonb_build_object('id',profile_id,'name',trim(employee_name),'branch',branch_name,'imageUrl','','role','employee','points',0,'reviewsCount',0,'isCoverage',false,'stats',jsonb_build_object('positive',0,'negative',0,'complaints',0,'safety',0)));
 insert into public.user_access(uid,profile_id,role,branch) values(target_uid,profile_id,'employee',branch_name);
 insert into private.account_usernames(uid,username,chosen) values(target_uid,'emp.'||left(replace(target_uid::text,'-',''),24),false);
end $$;

revoke all on function public.complete_branch_registration(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_branch_registration(uuid,uuid,text,text,text) to service_role;

create function public.branch_registration_exists(actor_uid uuid, profile_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare branch_name text; attempt_count integer;
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 select branch into branch_name from public.user_access where uid=actor_uid and role='manager' and not disabled;
 if branch_name is null then raise exception 'Branch manager required' using errcode='42501'; end if;
 insert into private.login_throttle(bucket,minute,attempts) values('registration:'||actor_uid::text,date_trunc('minute',now()),1)
 on conflict(bucket) do update set minute=excluded.minute,attempts=case when login_throttle.minute=excluded.minute then login_throttle.attempts+1 else 1 end returning attempts into attempt_count;
 if attempt_count>20 then raise exception 'Registration rate exceeded' using errcode='54000'; end if;
 return exists(select 1 from public.profiles p join public.user_access a on a.profile_id=p.id where p.id=branch_registration_exists.profile_id and p.branch=branch_name and a.branch=branch_name and a.role='employee' and not a.disabled);
end $$;
revoke all on function public.branch_registration_exists(uuid,text) from public,anon,authenticated;
grant execute on function public.branch_registration_exists(uuid,text) to service_role;

create function public.finish_self_account_setup(target_uid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if not exists(select 1 from public.user_access a join private.account_usernames n on n.uid=a.uid where a.uid=target_uid and not a.disabled and n.chosen) or private.password_is_default(target_uid) then raise exception 'Setup incomplete' using errcode='42501'; end if;
 delete from auth.sessions where user_id=target_uid;
 delete from auth.refresh_tokens where user_id=target_uid::text;
end $$;
revoke all on function public.finish_self_account_setup(uuid) from public,anon,authenticated;
grant execute on function public.finish_self_account_setup(uuid) to service_role;
commit;
