-- Keep simulation access unchanged; rank eligible accounts by recorded successful logins.
create or replace function public.simulation_targets() returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if not public.get_simulation_enabled() then raise insufficient_privilege; end if;
 return query select jsonb_build_object('id',p.id,'name',p.data->>'name','role',a.role,'branch',a.branch)
 from public.user_access a join public.profiles p on p.id=a.profile_id
 left join lateral (
   select count(*) as successful_logins from private.usage_logins l
   where l.user_id=a.uid and l.succeeded and l.recorded_at>=now()-interval '90 days'
 ) activity on true
 where not a.disabled and a.role in ('employee','manager') and not private.employee_is_disabled(p.id)
 order by activity.successful_logins desc,p.data->>'name',p.id;
end $$;
revoke all on function public.simulation_targets() from public,anon;
grant execute on function public.simulation_targets() to authenticated;
