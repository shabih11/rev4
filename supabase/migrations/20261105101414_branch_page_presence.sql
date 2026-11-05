-- Reuse private, server-timed heartbeats for branch managers as well as employees.
create or replace function public.record_employee_page_presence() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(private.account_role(),'') not in ('employee','manager') then
    raise exception 'Active employee or manager required' using errcode='42501';
  end if;
  insert into private.employee_page_presence as presence(user_id,last_seen_at)
    values(auth.uid(),clock_timestamp())
    on conflict(user_id) do update set last_seen_at=excluded.last_seen_at
      where presence.last_seen_at < excluded.last_seen_at-interval '45 seconds';
end $$;

-- Only admins can read branch presence; aggregate multiple accounts per branch.
create function public.get_branch_last_presence() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or private.account_role() is distinct from 'admin' then
    raise exception 'Admin required' using errcode='42501';
  end if;
  select coalesce(jsonb_object_agg(branch_id,last_seen_at),'{}'::jsonb) into result
  from (
    select b.id as branch_id,max(presence.last_seen_at) as last_seen_at
    from public.branches b
    left join public.user_access a on a.branch=b.id and a.role='manager' and not a.disabled
    left join private.employee_page_presence presence on presence.user_id=a.uid
    group by b.id
  ) branches;
  return result;
end $$;

revoke all on function public.record_employee_page_presence(),public.get_branch_last_presence() from public,anon;
grant execute on function public.record_employee_page_presence(),public.get_branch_last_presence() to authenticated;
