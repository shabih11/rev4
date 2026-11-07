-- Foreground page presence is private operational data, never a profile field.
create table private.employee_page_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null
);
alter table private.employee_page_presence enable row level security;
revoke all on private.employee_page_presence from public, anon, authenticated;
grant all on private.employee_page_presence to service_role;

create function public.record_employee_page_presence() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.account_role() is distinct from 'employee' then
    raise exception 'Active employee required' using errcode='42501';
  end if;
  insert into private.employee_page_presence as presence(user_id,last_seen_at)
    values(auth.uid(),clock_timestamp())
    on conflict(user_id) do update set last_seen_at=excluded.last_seen_at
      where presence.last_seen_at < excluded.last_seen_at-interval '45 seconds';
end $$;

create function public.get_employee_last_presence() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or private.account_role() is distinct from 'admin' then
    raise exception 'Admin required' using errcode='42501';
  end if;
  select coalesce(jsonb_object_agg(employee_id,last_seen_at),'{}'::jsonb) into result
  from (
    select p.id as employee_id,max(presence.last_seen_at) as last_seen_at
    from public.profiles p
    left join public.user_access a on a.profile_id=p.id
    left join private.employee_page_presence presence on presence.user_id=a.uid
    where p.data->>'role'='employee'
    group by p.id
  ) employees;
  return result;
end $$;

revoke all on function public.record_employee_page_presence(),public.get_employee_last_presence() from public,anon;
grant execute on function public.record_employee_page_presence(),public.get_employee_last_presence() to authenticated;
