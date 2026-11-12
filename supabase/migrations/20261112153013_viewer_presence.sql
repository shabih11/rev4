begin;
-- Return the latest 50 employee and viewer visitors; expiry distinguishes current activity.
create or replace function public.get_online_employees() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then
  raise insufficient_privilege;
 end if;
 select coalesce(jsonb_object_agg(id,expires_at),'{}'::jsonb) into result from (
  select p.id,max(s.last_seen_at)+interval '5 minutes' as expires_at
  from public.profiles p
  join public.user_access a on a.profile_id=p.id and a.role in ('employee','viewer') and not a.disabled
  join private.employee_page_presence s on s.user_id=a.uid
  where p.data->>'role' in ('employee','viewer') and s.last_seen_at<=now()
  group by p.id
  order by max(s.last_seen_at) desc,p.id
  limit 50
 ) recent;
 return result;
end $$;
revoke all on function public.get_online_employees() from public,anon;
grant execute on function public.get_online_employees() to authenticated;

create or replace function public.record_employee_page_presence() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(private.account_role(),'') not in ('employee','manager','viewer') then
  raise insufficient_privilege;
 end if;
 insert into private.employee_page_presence as presence(user_id,last_seen_at)
 values(auth.uid(),clock_timestamp())
 on conflict(user_id) do update set last_seen_at=excluded.last_seen_at
 where presence.last_seen_at<excluded.last_seen_at-interval '45 seconds';
end $$;
revoke all on function public.record_employee_page_presence() from public,anon;
grant execute on function public.record_employee_page_presence() to authenticated;
commit;
