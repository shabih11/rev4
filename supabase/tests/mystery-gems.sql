-- Run only with approval; all fixtures and assertions are rolled back.
begin;
insert into public.branches(id,data) values('magic-test-branch','{"id":"magic-test-branch","name":"Magic test","start":"16:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name',id,'branch','magic-test-branch','role',role) from (values('magic-test-admin','admin'),('magic-test-manager','manager'),('magic-test-a','employee'),('magic-test-b','employee')) f(id,role);
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000001','magic-admin@example.invalid'),('20000000-0000-4000-8000-000000000002','magic-manager@example.invalid'),('20000000-0000-4000-8000-000000000003','magic-a@example.invalid'),('20000000-0000-4000-8000-000000000004','magic-b@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values('20000000-0000-4000-8000-000000000001','magic-test-admin','admin',null),('20000000-0000-4000-8000-000000000002','magic-test-manager','manager','magic-test-branch'),('20000000-0000-4000-8000-000000000003','magic-test-a','employee','magic-test-branch'),('20000000-0000-4000-8000-000000000004','magic-test-b','employee','magic-test-branch');
insert into public.reviews(id,data) select 'magic-test-review-'||n,jsonb_build_object('id','magic-test-review-'||n,'branch','magic-test-branch','rating','5','date',to_char((now() at time zone 'Asia/Riyadh')::date-1,'DD-MM-YYYY'),'time','12:00','linkedEmployeeIds',jsonb_build_array('magic-test-a')) from generate_series(1,20) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('magic.expected',(select public.get_avatar_store()#>'{magic,settings}')::text,true);
select public.save_magic_settings('{"boxes":true,"themes":false,"price":60}',current_setting('magic.expected')::jsonb);
do $$ begin
 begin perform public.save_magic_settings('{"boxes":true,"themes":false,"price":60}','{}'::jsonb); raise exception 'Stale config accepted'; exception when serialization_failure then null; end;
 begin perform public.save_magic_settings('{"boxes":true,"themes":true,"price":-1}',public.get_avatar_store()#>'{magic,settings}'); raise exception 'Negative price accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.save_magic_settings('{"boxes":true,"themes":true,"price":0}',public.get_avatar_store()#>'{magic,settings}'); raise exception 'Manager configured boxes'; exception when insufficient_privilege then null; end;
 begin perform public.purchase_mystery_box('20000000-0000-4000-8000-000000000010',60); raise exception 'Manager bought box'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare first_gem text; begin
 begin perform public.save_magic_settings('{"boxes":true,"themes":true,"price":0}',public.get_avatar_store()#>'{magic,settings}'); raise exception 'Employee configured boxes'; exception when insufficient_privilege then null; end;
 begin perform public.purchase_mystery_box('20000000-0000-4000-8000-000000000010',0); raise exception 'Client price accepted'; exception when serialization_failure then null; end;
 first_gem:=public.purchase_mystery_box('20000000-0000-4000-8000-000000000010',60);
 if first_gem is null or first_gem<>all(array['amber','pearl','emerald','sapphire','rose','amethyst']) then raise exception 'Unknown jewel'; end if;
 if public.purchase_mystery_box('20000000-0000-4000-8000-000000000010',60)<>first_gem then raise exception 'Retry changed jewel'; end if;
 if (public.get_avatar_store()#>>'{wallet,available}')::numeric<>40 then raise exception 'Retry or balance incorrect'; end if;
 begin perform public.purchase_mystery_box('20000000-0000-4000-8000-000000000011',60); raise exception 'Overspend accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.equip_gem(first_gem); raise exception 'Disabled themes accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.gem_purchases values('20000000-0000-4000-8000-000000000012','magic-test-a','amber',0,now()); raise exception 'Direct purchase accepted'; exception when insufficient_privilege then null; end;
 begin perform private.avatar_wallet('magic-test-b'); raise exception 'Private wallet callable'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if jsonb_array_length(public.get_avatar_store()#>'{magic,owned}')<>0 then raise exception 'Other inventory leaked'; end if;
 begin perform public.purchase_mystery_box('20000000-0000-4000-8000-000000000010',60); raise exception 'Another employees retry accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_magic_settings('{"boxes":false,"themes":true,"price":60}',public.get_avatar_store()#>'{magic,settings}');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 perform public.equip_gem(public.get_avatar_store()#>>'{magic,selected}');
 begin perform public.purchase_mystery_box('20000000-0000-4000-8000-000000000011',60); raise exception 'Disabled boxes accepted'; exception when insufficient_privilege then null; end;
 perform public.equip_gem(null);
 if public.get_avatar_store()#>>'{magic,selected}' is not null then raise exception 'Default theme failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.equip_gem('amber'); raise exception 'Unowned gem equipped'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_magic_settings('{"boxes":true,"themes":true,"price":0}',public.get_avatar_store()#>'{magic,settings}');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 for n in 1..7 loop perform public.purchase_mystery_box(gen_random_uuid(),0); end loop;
 if jsonb_array_length(public.get_avatar_store()#>'{magic,owned}')>6 then raise exception 'Invalid inventory'; end if;
 if not exists(select 1 from jsonb_array_elements(public.get_avatar_store()#>'{magic,owned}') item where (item->>'count')::int>1) then raise exception 'Duplicates not retained'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.merge_employees('magic-test-a','magic-test-b','Magic merged','magic-test-branch');
reset role;
do $$ begin
 if exists(select 1 from public.gem_purchases where profile_id='magic-test-b') then raise exception 'Gem merge failed'; end if;
 if (select count(*) from public.gem_purchases where profile_id='magic-test-a')<>8 then raise exception 'Purchases lost during merge'; end if;
 if (private.avatar_wallet('magic-test-a')->>'spent')::numeric<>60 then raise exception 'Merge spending incorrect'; end if;
 if not exists(select 1 from public.gem_equipped where profile_id='magic-test-a') then raise exception 'Merged equipped gem lost'; end if;
 if (select count(*) from public.reviews where id like 'magic-test-review-%')<>20 then raise exception 'Rank reviews changed'; end if;
 if has_function_privilege('anon','public.purchase_mystery_box(uuid,numeric)','execute') then raise exception 'Anonymous purchase exposed'; end if;
end $$;
rollback;
select 'Mystery gems, duplicate rewards, balances, idempotency, independent flags, authorization and merges verified' as verification;
