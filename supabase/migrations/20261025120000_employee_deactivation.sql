-- Reversible employee deactivation; historical profiles/reviews/shifts remain intact.
begin;
create table public.employee_deactivations (
  profile_id text primary key references public.profiles(id) on delete restrict,
  disabled_at timestamptz not null default now(),
  disabled_by uuid not null,
  access_was_disabled boolean not null default false
);
alter table public.employee_deactivations enable row level security;
revoke all on public.employee_deactivations from public, anon, authenticated;

create function private.employee_is_disabled(employee_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_deactivations where profile_id=employee_id)
$$;
revoke all on function private.employee_is_disabled(text) from public,anon;
grant execute on function private.employee_is_disabled(text) to authenticated;

create function public.set_employee_disabled(employee_id text, disabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous_access_disabled boolean;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then
  raise exception 'Admin required' using errcode='42501';
 end if;
 if employee_id is null or disabled is null then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.profiles where id=employee_id and data->>'role'='employee' for update;
 if not found or exists(select 1 from public.user_access where profile_id=employee_id and role<>'employee') then
  raise exception 'Employee required';
 end if;
 if disabled then
  select ua.disabled into previous_access_disabled from public.user_access ua where profile_id=employee_id for update;
  insert into public.employee_deactivations(profile_id,disabled_by,access_was_disabled)
   values(employee_id,auth.uid(),coalesce(previous_access_disabled,false)) on conflict(profile_id) do nothing;
  update public.user_access set disabled=true where profile_id=employee_id;
 else
  delete from public.employee_deactivations where profile_id=employee_id returning access_was_disabled into previous_access_disabled;
  if found then update public.user_access set disabled=previous_access_disabled where profile_id=employee_id; end if;
 end if;
 update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
end $$;
revoke all on function public.set_employee_disabled(text,boolean) from public,anon;
grant execute on function public.set_employee_disabled(text,boolean) to authenticated;

-- A new login link cannot bypass an existing deactivation.
create function private.enforce_employee_deactivation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.employee_is_disabled(new.profile_id) then new.disabled=true; end if;
 return new;
end $$;
revoke all on function private.enforce_employee_deactivation() from public,anon,authenticated;
create trigger enforce_employee_deactivation before insert or update on public.user_access
 for each row execute function private.enforce_employee_deactivation();

-- Keep the original summary private; all clients receive the same authoritative inactive IDs.
alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_deactivation;
revoke all on function private.read_model_before_deactivation() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; disabled_ids jsonb;
begin
 result=private.read_model_before_deactivation();
 select coalesce(jsonb_agg(profile_id order by profile_id),'[]'::jsonb) into disabled_ids from public.employee_deactivations;
 if private.account_role() is distinct from 'admin' then
  result=jsonb_set(result,'{directory}',(select coalesce(jsonb_agg(item),'[]'::jsonb)
   from jsonb_array_elements(result->'directory') item where not private.employee_is_disabled(item->>'id')));
 end if;
 return result || jsonb_build_object('disabledEmployeeIds',disabled_ids);
end $$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;
alter policy profiles_read on public.profiles using (
 (select private.account_role()) is not null and
 ((select private.account_role())='admin' or not private.employee_is_disabled(id))
);

-- Existing merge RPCs must not consume an archived identity.
alter function public.merge_employees(text,text,text,text) set schema private;
alter function private.merge_employees(text,text,text,text) rename to merge_employees_before_deactivation;
revoke all on function private.merge_employees_before_deactivation(text,text,text,text) from public,anon,authenticated;
create function public.merge_employees(primary_id text,duplicate_id text,requested_name text,requested_branch text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if private.employee_is_disabled(primary_id) or private.employee_is_disabled(duplicate_id) then raise exception 'Reactivate employee before merging'; end if;
 perform private.merge_employees_before_deactivation(primary_id,duplicate_id,requested_name,requested_branch);
end $$;
revoke all on function public.merge_employees(text,text,text,text) from public,anon;
grant execute on function public.merge_employees(text,text,text,text) to authenticated;
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
