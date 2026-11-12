begin;
-- All active application roles can read and record presence. Anonymous access stays denied.
create or replace function public.get_online_employees() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or coalesce(private.account_role(),'') not in ('employee','manager','viewer','admin') then raise insufficient_privilege; end if;
 select coalesce(jsonb_object_agg(id,expires_at),'{}'::jsonb) into result from (
  select id,max(expires_at) as expires_at from (
   select p.id,max(s.last_seen_at)+interval '5 minutes' as expires_at
   from public.profiles p join public.user_access a on a.profile_id=p.id and a.role in ('employee','manager','viewer','admin') and not a.disabled
   join private.employee_page_presence s on s.user_id=a.uid
   where p.data->>'role' in ('employee','manager','viewer','admin') and s.last_seen_at<=now() group by p.id
   union all
   select c.profile_id,case when s.ends_at>now() then least(s.ends_at,now()+interval '30 seconds') else s.ends_at end
   from private.owner_presence_settings c
   join lateral (select starts_at,ends_at from private.owner_presence_sessions where starts_at<=now() and starts_at>=c.activated_at order by starts_at desc limit 1) s on true
   where c.id=1 and c.enabled and exists(select 1 from public.user_access a where a.profile_id=c.profile_id and a.role='viewer' and not a.disabled)
  ) sources group by id order by max(expires_at) desc,id limit 50
 ) recent;
 return result;
end $$;
revoke all on function public.get_online_employees() from public,anon;
grant execute on function public.get_online_employees() to authenticated;

create or replace function public.record_employee_page_presence() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(private.account_role(),'') not in ('employee','manager','viewer','admin') then
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
