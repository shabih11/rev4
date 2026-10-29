begin;
-- Credential administration always uses the caller's live, server-owned membership.
create or replace function public.authorize_employee_account(target_profile text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('employee-account:'||auth.uid()::text,0));
 if (select count(*) from private.employee_account_actions where actor=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Too many requests' using errcode='42501'; end if;
 select a.uid into result from public.user_access a join public.profiles p on p.id=a.profile_id
 where p.id=target_profile and p.data->>'role'='employee' and a.role='employee' and not a.disabled;
 if result is null then raise exception 'Employee account unavailable' using errcode='42501'; end if;
 insert into private.employee_account_actions(actor,target) values(auth.uid(),target_profile);
 delete from private.employee_account_actions where created_at<now()-interval '30 days';
 return result;
end $$;
revoke all on function public.authorize_employee_account(text) from public,anon;
grant execute on function public.authorize_employee_account(text) to authenticated;

create or replace function public.rename_me(new_name text, previous_name text) returns void
language plpgsql set search_path='' as $$
declare profile text := private.account_profile(); actual text;
begin
 if private.account_role()='manager' or profile is null or length(trim(new_name)) not between 1 and 120 then raise exception 'Profile rename unavailable' using errcode='42501'; end if;
 select data->>'name' into actual from public.profiles where id=profile for update;
 if actual is distinct from previous_name then raise exception 'write-conflict' using errcode='40001'; end if;
 update public.profiles set data=jsonb_set(data,'{name}',to_jsonb(trim(new_name))) where id=profile;
end $$;
-- Protect direct table updates and write_rows as well as the rename RPC.
create function private.guard_manager_profile_name() returns trigger
language plpgsql set search_path='' as $$
begin
 if private.account_role()='manager' and new.data->>'name' is distinct from old.data->>'name' then
  raise exception 'Branch administration cannot rename accounts' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_manager_profile_name() from public,anon,authenticated;
create trigger guard_manager_profile_name before update on public.profiles
for each row execute function private.guard_manager_profile_name();
commit;
