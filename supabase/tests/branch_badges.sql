-- Isolated local / CI test; all settings and accounts roll back.
begin;
insert into public.profiles(id,data) values('badges-admin','{"id":"badges-admin","name":"Badge test","role":"admin","branch":""}');
insert into auth.users(id,email) values('22000000-0000-4000-8000-000000000001','badges-admin@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values('22000000-0000-4000-8000-000000000001','badges-admin','admin',null);
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare actual jsonb; flag boolean; invalid jsonb; begin
 actual:=public.get_employee_features()->'settings';
 foreach flag in array array[true,false,true] loop
  perform public.save_employee_features(actual||jsonb_build_object('branchBadges',flag),actual);
  actual:=public.get_employee_features()->'settings';
  if actual->'branchBadges' is distinct from to_jsonb(flag) then raise exception 'Badge toggle not saved'; end if;
 end loop;
 -- Older clients must preserve the flag instead of erasing it.
 perform public.save_employee_features(actual-'branchBadges',actual);
 actual:=public.get_employee_features()->'settings';
 if actual->'branchBadges' is distinct from 'true'::jsonb then raise exception 'Legacy save erased flag'; end if;
 foreach invalid in array array['null'::jsonb,'"true"'::jsonb,'1'::jsonb] loop
  begin
   perform public.save_employee_features(actual||jsonb_build_object('branchBadges',invalid),actual);
   raise exception 'Invalid badge flag accepted';
  exception when sqlstate '22023' then null; end;
 end loop;
 begin
  perform public.save_employee_features(actual||'{"branchBadges":false}',actual-'branchBadges');
  raise exception 'Stale settings accepted';
 exception when sqlstate 'PT409' then null; end;
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin
  perform public.save_employee_features('{}','{}');
  raise exception 'Unauthenticated save accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
