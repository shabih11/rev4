begin;

create table private.simulation_settings (
 id integer primary key check (id=1),
 enabled boolean not null default false
);
alter table private.simulation_settings enable row level security;
revoke all on private.simulation_settings from public,anon,authenticated;
insert into private.simulation_settings(id) values (1);

create function public.get_simulation_enabled() returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 return coalesce((select enabled from private.simulation_settings where id=1),false);
end $$;

create function public.set_simulation_enabled(new_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 update private.simulation_settings set enabled=new_enabled where id=1;
 if not new_enabled then
   update private.admin_simulations set ended_at=clock_timestamp() where ended_at is null;
 end if;
end $$;

revoke all on function public.get_simulation_enabled(),public.set_simulation_enabled(boolean) from public,anon;
grant execute on function public.get_simulation_enabled(),public.set_simulation_enabled(boolean) to authenticated;

create or replace function public.simulation_targets() returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if not public.get_simulation_enabled() then raise insufficient_privilege; end if;
 return query select jsonb_build_object('id',p.id,'name',p.data->>'name','role',a.role,'branch',a.branch)
 from public.user_access a join public.profiles p on p.id=a.profile_id
 where not a.disabled and a.role in ('employee','manager') and not private.employee_is_disabled(p.id)
 order by p.data->>'name',p.id;
end $$;

create or replace function public.start_simulation(target_profile text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_access public.user_access; simulation uuid; profile jsonb; session_id text:=auth.jwt()->>'session_id';
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' or nullif(session_id,'') is null then raise insufficient_privilege; end if;
 perform 1 from private.simulation_settings where id=1 and enabled for share;
 if not found then raise insufficient_privilege; end if;
 select * into target_access from public.user_access where profile_id=target_profile and not disabled and role in ('employee','manager');
 if target_access.uid is null or private.employee_is_disabled(target_profile) then raise insufficient_privilege; end if;
 select data into profile from public.profiles where id=target_profile;
 update private.admin_simulations set ended_at=clock_timestamp() where actor=auth.uid() and auth_session=session_id and ended_at is null;
 insert into private.admin_simulations(actor,auth_session,target) values(auth.uid(),session_id,target_access.uid) returning id into simulation;
 return jsonb_build_object('id',simulation,'target',profile||jsonb_build_object('role',target_access.role,'branch',target_access.branch));
end $$;

create or replace function private.resolve_simulation(simulation_id uuid, operation text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_uid uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if not public.get_simulation_enabled() then raise insufficient_privilege; end if;
 select s.target into target_uid from private.admin_simulations s join public.user_access a on a.uid=s.target
 where s.id=simulation_id and s.actor=auth.uid() and s.auth_session=auth.jwt()->>'session_id'
 and s.ended_at is null and s.expires_at>clock_timestamp() and not a.disabled
 and a.role in ('employee','manager') and not private.employee_is_disabled(a.profile_id);
 if target_uid is null then raise insufficient_privilege; end if;
 insert into private.admin_simulation_reads(simulation_id,operation) values(simulation_id,operation);
 return target_uid;
end $$;

commit;
