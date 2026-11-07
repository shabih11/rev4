begin;
-- Auth timestamps stay out of profiles and the shared read model.
-- No client-supplied identifiers or timestamps; authorization uses active membership.
create function public.get_employee_last_sign_ins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or private.account_role() is distinct from 'admin' then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(p.id, u.last_sign_in_at), '{}'::jsonb)
  into result
  from public.profiles p
  left join public.user_access a on a.profile_id = p.id
  left join auth.users u on u.id = a.uid
  where p.data->>'role' = 'employee';
  return result;
end $$;
revoke all on function public.get_employee_last_sign_ins() from public, anon;
grant execute on function public.get_employee_last_sign_ins() to authenticated;
commit;
