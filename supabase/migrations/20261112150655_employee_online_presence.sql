begin;
-- Expose only unexpired employee activity, never historical presence or account IDs.
create function public.get_online_employees() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then
  raise insufficient_privilege;
 end if;
 select coalesce(jsonb_object_agg(id,expires_at),'{}'::jsonb) into result from (
  select p.id,max(s.last_seen_at)+interval '5 minutes' as expires_at
  from public.profiles p
  join public.user_access a on a.profile_id=p.id and a.role='employee' and not a.disabled
  join private.employee_page_presence s on s.user_id=a.uid
  where p.data->>'role'='employee' and s.last_seen_at>now()-interval '5 minutes' and s.last_seen_at<=now()
  group by p.id
 ) recent;
 return result;
end $$;
revoke all on function public.get_online_employees() from public,anon;
grant execute on function public.get_online_employees() to authenticated;
commit;
