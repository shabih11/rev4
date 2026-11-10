begin;
-- Simulation audit is separate from employee presence, rewards and analytics.
create table private.admin_simulations (
 id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users(id),
 auth_session text not null, target uuid not null references auth.users(id),
 started_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'), ended_at timestamptz
);
alter table private.admin_simulations enable row level security;
revoke all on private.admin_simulations from public,anon,authenticated;
create table private.admin_simulation_reads (
 id bigint generated always as identity primary key,
 simulation_id uuid not null references private.admin_simulations(id),
 operation text not null, read_at timestamptz not null default clock_timestamp()
);
alter table private.admin_simulation_reads enable row level security;
revoke all on private.admin_simulation_reads from public,anon,authenticated;

create function public.simulation_targets() returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 return query select jsonb_build_object('id',p.id,'name',p.data->>'name','role',a.role,'branch',a.branch)
 from public.user_access a join public.profiles p on p.id=a.profile_id
 where not a.disabled and a.role in ('employee','manager') and not private.employee_is_disabled(p.id)
 order by p.data->>'name',p.id;
end $$;
create function public.start_simulation(target_profile text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_access public.user_access; simulation uuid; profile jsonb; session_id text:=auth.jwt()->>'session_id';
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' or nullif(session_id,'') is null then raise insufficient_privilege; end if;
 select * into target_access from public.user_access where profile_id=target_profile and not disabled and role in ('employee','manager');
 if target_access.uid is null or private.employee_is_disabled(target_profile) then raise insufficient_privilege; end if;
 select data into profile from public.profiles where id=target_profile;
 update private.admin_simulations set ended_at=clock_timestamp() where actor=auth.uid() and auth_session=session_id and ended_at is null;
 insert into private.admin_simulations(actor,auth_session,target) values(auth.uid(),session_id,target_access.uid) returning id into simulation;
 return jsonb_build_object('id',simulation,'target',profile||jsonb_build_object('role',target_access.role,'branch',target_access.branch));
end $$;
create function public.stop_simulation(simulation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 update private.admin_simulations set ended_at=coalesce(ended_at,clock_timestamp())
 where id=simulation_id and actor=auth.uid() and auth_session=auth.jwt()->>'session_id';
 if not found then raise insufficient_privilege; end if;
end $$;
-- Only resolves authenticated, active actors/targets. No user supplied role/uid is trusted.
create function private.resolve_simulation(simulation_id uuid, operation text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_uid uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 select s.target into target_uid from private.admin_simulations s join public.user_access a on a.uid=s.target
 where s.id=simulation_id and s.actor=auth.uid() and s.auth_session=auth.jwt()->>'session_id'
 and s.ended_at is null and s.expires_at>clock_timestamp() and not a.disabled
 and a.role in ('employee','manager') and not private.employee_is_disabled(a.profile_id);
 if target_uid is null then raise insufficient_privilege; end if;
 insert into private.admin_simulation_reads(simulation_id,operation) values(simulation_id,operation);
 return target_uid;
end $$;
-- SECURITY INVOKER is essential: table reads retain authenticated RLS.
-- Static allowlist only; this endpoint has no business-data write operation.
create function public.simulation_read(simulation_id uuid, operation text, args jsonb default '{}', query jsonb default '{}', row_offset integer default 0, row_limit integer default 500) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target_uid uuid; result jsonb; claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if operation not in ('get_my_account','get_read_model','get_employee_features','read_rows','get_employee_last_presence','get_branch_last_presence','app_state','sea_mission_completions','management_contact','timeline_events','employee_merge_requests') or operation is null then raise insufficient_privilege; end if;
 if row_offset is null or row_limit is null or row_offset<0 or row_limit<1 or row_limit>1000 then raise exception 'Invalid pagination'; end if;
 target_uid:=private.resolve_simulation(simulation_id,operation);
 perform set_config('request.jwt.claim.sub',target_uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target_uid,'role','authenticated')::text,true);
 case operation
 when 'get_my_account' then
   result:=public.get_my_account()-'email'-'username';
   result:=result||jsonb_build_object('mustSetUsername',false,'mustChangePassword',false);
 when 'get_read_model' then result:=public.get_read_model();
 when 'get_employee_features' then result:=public.get_employee_features();
 when 'get_employee_last_presence' then result:=public.get_employee_last_presence();
 when 'get_branch_last_presence' then result:=public.get_branch_last_presence();
 when 'read_rows' then
   select coalesce(jsonb_agg(r),'[]') into result from (
     select r from public.read_rows(args->>'source',array(select jsonb_array_elements_text(coalesce(args->'requested_branches','[]'))),array(select jsonb_array_elements_text(coalesce(args->'requested_employees','[]'))),coalesce((args->>'all_rows')::boolean,false)) r
     limit row_limit offset row_offset) rows;
 when 'app_state' then select jsonb_build_array(jsonb_build_object('version',version)) into result from public.app_state where id=1;
 when 'sea_mission_completions' then select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (select branch,day,approved_at from public.sea_mission_completions order by branch,day limit row_limit offset row_offset) r;
 when 'management_contact' then select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (select phone from public.management_contact where id='administration') r;
 when 'employee_merge_requests' then select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (select * from public.employee_merge_requests limit row_limit offset row_offset) r;
 when 'timeline_events' then
   if query->>'kind' is distinct from 'eq.shift' then raise insufficient_privilege; end if;
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (
     select id,branch,occurred_at,employee_ids from public.timeline_events
     where kind='shift' and occurred_at<=substring(query->>'occurred_at' from 5)::timestamptz
     and employee_ids && substring(query->>'employee_ids' from 4)::text[]
     order by occurred_at desc,id desc limit row_limit offset row_offset) r;
 end case;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 raise;
end $$;
revoke all on function public.simulation_targets(),public.start_simulation(text),public.stop_simulation(uuid),public.simulation_read(uuid,text,jsonb,jsonb,integer,integer),private.resolve_simulation(uuid,text) from public,anon;
grant execute on function public.simulation_targets(),public.start_simulation(text),public.stop_simulation(uuid),public.simulation_read(uuid,text,jsonb,jsonb,integer,integer),private.resolve_simulation(uuid,text) to authenticated;
commit;
