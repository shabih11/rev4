begin;
insert into public.branches(id,data) values ('order-test','{"id":"order-test","name":"Order test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('order-admin','{"id":"order-admin","name":"Admin","role":"admin","branch":"order-test"}'),
 ('order-low','{"id":"order-low","name":"A","role":"employee","branch":"order-test"}'),
 ('order-high','{"id":"order-high","name":"Z","role":"employee","branch":"order-test"}');
insert into auth.users(id,email) values
 ('71000000-0000-4000-8000-000000000001','order-admin@example.invalid'),
 ('71000000-0000-4000-8000-000000000002','order-low@example.invalid'),
 ('71000000-0000-4000-8000-000000000003','order-high@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('71000000-0000-4000-8000-000000000001','order-admin','admin',null),
 ('71000000-0000-4000-8000-000000000002','order-low','employee','order-test'),
 ('71000000-0000-4000-8000-000000000003','order-high','employee','order-test');
insert into private.usage_logins(user_id,profile_id,succeeded)
select '71000000-0000-4000-8000-000000000003'::uuid,'order-high',true from generate_series(1,3);
insert into private.usage_logins(user_id,profile_id,succeeded)
select '71000000-0000-4000-8000-000000000002'::uuid,'order-low',false from generate_series(1,10);
update private.simulation_settings set enabled=true where id=1;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare ids text[]; begin
 select array_agg(item->>'id' order by position) into ids from public.simulation_targets() with ordinality as t(item,position)
 where item->>'id' in ('order-low','order-high');
 if ids is distinct from array['order-high','order-low'] then raise exception 'Login ranking mismatch'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.simulation_targets(); raise exception 'Employee access allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.simulation_targets(); raise exception 'Anonymous access allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
