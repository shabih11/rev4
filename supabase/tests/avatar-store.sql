-- Run in a single rolled-back transaction, after the avatar_store migration.
begin;
insert into public.branches(id,data) values('shop-test-branch','{"id":"shop-test-branch","name":"Shop test","start":"16:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name',name,'branch','shop-test-branch','role',role) from (values
 ('shop-test-admin','Shop admin','admin'),('shop-test-manager','Shop manager','manager'),('shop-test-a','Shop A','employee'),('shop-test-b','Shop B','employee'),('shop-test-duplicate','Shop duplicate','employee')) f(id,name,role);
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','shop-admin@example.invalid'),('10000000-0000-4000-8000-000000000002','shop-manager@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','shop-a@example.invalid'),('10000000-0000-4000-8000-000000000004','shop-b@example.invalid'),('10000000-0000-4000-8000-000000000005','shop-duplicate@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('10000000-0000-4000-8000-000000000001','shop-test-admin','admin',null),('10000000-0000-4000-8000-000000000002','shop-test-manager','manager','shop-test-branch'),
 ('10000000-0000-4000-8000-000000000003','shop-test-a','employee','shop-test-branch'),('10000000-0000-4000-8000-000000000004','shop-test-b','employee','shop-test-branch'),('10000000-0000-4000-8000-000000000005','shop-test-duplicate','employee','shop-test-branch');
insert into public.reviews(id,data) select 'shop-test-review-'||n,jsonb_build_object('id','shop-test-review-'||n,'branch','shop-test-branch','rating','5','date',to_char((now() at time zone 'Asia/Riyadh')::date-1,'DD-MM-YYYY'),'time','12:00','linkedEmployeeIds',jsonb_build_array('shop-test-a')) from generate_series(1,5) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_employee_features((select data||'{"avatars":true}' from public.employee_feature_settings where id=1),(select data from public.employee_feature_settings where id=1));
select set_config('shop.collection',public.save_avatar_collection(null,'Shop test',2,true)::text,true);
insert into storage.objects(bucket_id,name,metadata) select 'avatar-store',path,'{"mimetype":"image/webp"}'::jsonb from (values
 ('10000000-0000-4000-8000-000000000011.webp'),('10000000-0000-4000-8000-000000000012.webp'),('10000000-0000-4000-8000-000000000013.webp'),('10000000-0000-4000-8000-000000000014.webp')) f(path);
select set_config('shop.v1',public.add_avatar_variant(current_setting('shop.collection')::uuid,'One','10000000-0000-4000-8000-000000000011.webp')::text,true);
select set_config('shop.v2',public.add_avatar_variant(current_setting('shop.collection')::uuid,'Two','10000000-0000-4000-8000-000000000012.webp')::text,true);
select set_config('shop.v3',public.add_avatar_variant(current_setting('shop.collection')::uuid,'Three','10000000-0000-4000-8000-000000000013.webp')::text,true);
select set_config('shop.v4',public.add_avatar_variant(current_setting('shop.collection')::uuid,'Four','10000000-0000-4000-8000-000000000014.webp')::text,true);
do $$ declare cleanup_policy text; permitted boolean; begin
 begin perform public.add_avatar_variant(current_setting('shop.collection')::uuid,'Missing','10000000-0000-4000-8000-000000000099.webp'); raise exception 'Missing upload accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_avatar_collection(current_setting('shop.collection')::uuid,'Stale',9,true,'{}'); raise exception 'Admin conflict accepted'; exception when serialization_failure then null; end;
 -- Supabase forbids direct SQL deletion from Storage. Evaluate the deployed cleanup policy without deleting an object.
 select pg_get_expr(polqual,polrelid) into cleanup_policy from pg_policy where polrelid='storage.objects'::regclass and polname='avatar_art_cleanup';
 if cleanup_policy is null then raise exception 'Artwork cleanup policy missing'; end if;
 execute format('select (%s) from storage.objects where bucket_id=$1 and name=$2',cleanup_policy) into permitted using 'avatar-store','10000000-0000-4000-8000-000000000011.webp';
 if permitted is distinct from false then raise exception 'Referenced artwork can be deleted'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.save_avatar_collection(null,'Denied',1,true); raise exception 'Manager edits catalog'; exception when insufficient_privilege then null; end;
 begin perform public.purchase_avatar(current_setting('shop.v1')::uuid,2); raise exception 'Manager purchases employee items'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (public.get_avatar_store()#>>'{wallet,available}')::numeric<>5 then raise exception 'Cumulative currency incorrect'; end if;
 begin perform public.purchase_avatar(current_setting('shop.v1')::uuid,0); raise exception 'Client changed price'; exception when serialization_failure then null; end;
 begin perform public.save_avatar_collection(null,'Denied',0,true); raise exception 'Employee edits catalog'; exception when insufficient_privilege then null; end;
 begin insert into public.avatar_purchases(variant_id,profile_id,price_paid) values(current_setting('shop.v1')::uuid,'shop-test-a',0); raise exception 'Direct purchase bypass'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('avatar-store','10000000-0000-4000-8000-000000000099.webp'); raise exception 'Employee uploads artwork'; exception when insufficient_privilege then null; end;
end $$;
select public.purchase_avatar(current_setting('shop.v1')::uuid,2);
select public.purchase_avatar(current_setting('shop.v2')::uuid,2);
do $$ begin
 if (public.get_avatar_store()#>>'{wallet,available}')::numeric<>1 then raise exception 'Purchase did not deduct currency'; end if;
 if (select count(*) from public.reviews where id like 'shop-test-review-%')<>5 then raise exception 'Purchase changed ranking data'; end if;
 begin perform public.purchase_avatar(current_setting('shop.v3')::uuid,2); raise exception 'Overspending accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.purchase_avatar(current_setting('shop.v1')::uuid,2); raise exception 'Exclusive variant resold'; exception when unique_violation then null; end;
 begin perform public.equip_avatar(current_setting('shop.v1')::uuid); raise exception 'Another employees avatar equipped'; exception when insufficient_privilege then null; end;
 if (public.get_avatar_store()#>>'{wallet,spent}')::numeric<>0 then raise exception 'Failed purchase deducted currency'; end if;
 if (select profile_id from public.avatar_purchases where variant_id=current_setting('shop.v1')::uuid)<>'shop-test-a' then raise exception 'Ownership changed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_avatar_collection(current_setting('shop.collection')::uuid,'Shop test',0,true,'{"name":"Shop test","price":2,"enabled":true}');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.purchase_avatar(current_setting('shop.v4')::uuid,0);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.merge_employees('shop-test-a','shop-test-duplicate','Shop merged','shop-test-branch');
do $$ begin
 if exists(select 1 from public.avatar_purchases where profile_id='shop-test-duplicate') then raise exception 'Merge did not transfer purchases'; end if;
 if (select profile_id from public.avatar_purchases where variant_id=current_setting('shop.v4')::uuid)<>'shop-test-a' then raise exception 'Merge lost exclusivity'; end if;
 if (select variant_id from public.avatar_equipped where profile_id='shop-test-a')<>current_setting('shop.v2')::uuid then raise exception 'Merge replaced selected avatar'; end if;
end $$;
select public.save_employee_features((select data||'{"avatars":false}' from public.employee_feature_settings where id=1),(select data from public.employee_feature_settings where id=1));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.purchase_avatar(current_setting('shop.v3')::uuid,0); raise exception 'Disabled store purchase accepted'; exception when insufficient_privilege then null; end;
 begin perform public.equip_avatar(null); raise exception 'Disabled store selection accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_avatar_store(); raise exception 'Anonymous store access'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.avatar_purchases; raise exception 'Anonymous ownership read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Avatar store ownership, balances, immutable artwork, authorization and merges verified' as verification;
rollback;
