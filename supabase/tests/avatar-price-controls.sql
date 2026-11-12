begin;
insert into public.profiles(id,data) values
 ('price-test-admin','{"id":"price-test-admin","name":"Price test","role":"admin","branch":"جاليري"}'),
 ('price-test-employee','{"id":"price-test-employee","name":"Price test","role":"employee","branch":"جاليري"}');
insert into auth.users(id,email) values
 ('70000000-0000-4000-8000-000000000001','price-admin@example.invalid'),
 ('70000000-0000-4000-8000-000000000002','price-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('70000000-0000-4000-8000-000000000001','price-test-admin','admin',null),
 ('70000000-0000-4000-8000-000000000002','price-test-employee','employee','جاليري');
insert into public.avatar_collections(id,name,price) values ('70000000-0000-4000-8000-000000000003','Price test',449);
insert into public.avatar_variants(id,collection_id,name,image_path,abaya_grade) values
 ('70000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000003','Price test','70000000-0000-4000-8000-000000000004.webp',0);
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',50,449);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.get_avatar_store()->'collections') c cross join lateral jsonb_array_elements(c->'variants') v where v->>'id'='70000000-0000-4000-8000-000000000004' and (v->>'price')::numeric=499) then raise exception 'Store did not return the adjusted price'; end if;
 begin perform public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',50,449); raise exception 'Stale price accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',10000,499); raise exception 'Invalid step accepted'; exception when invalid_parameter_value then null; end;
end $$;
select public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',-500,499);
reset role;
do $$ begin
 if (select v.enabled or private.avatar_sale_price(c,v)<>0 from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='70000000-0000-4000-8000-000000000004') then raise exception 'Zero did not hide variant'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.get_avatar_store()->'collections') c cross join lateral jsonb_array_elements(c->'variants') v where v->>'id'='70000000-0000-4000-8000-000000000004') then raise exception 'Hidden variant exposed for sale'; end if;
 begin perform public.purchase_avatar('70000000-0000-4000-8000-000000000004',0); raise exception 'Zero-price purchase allowed'; exception when invalid_parameter_value or insufficient_privilege then null; end;
 begin perform public.adjust_avatar_price('70000000-0000-4000-8000-000000000003',null,50,449); raise exception 'Employee changed price'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',500,0);
reset role;
do $$ declare current_price numeric; begin
 if not (select enabled from public.avatar_variants where id='70000000-0000-4000-8000-000000000004') then raise exception 'Positive price did not restore visibility'; end if;
 for i in 1..9 loop
 select private.avatar_sale_price(c,v) into current_price from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='70000000-0000-4000-8000-000000000004';
 perform public.adjust_avatar_price('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',500,current_price);
 end loop;
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='70000000-0000-4000-8000-000000000004')<>4000 then raise exception 'Upper bound failed'; end if;
end $$;
-- Base-price changes update model prices consistently without repricing purchases.
select public.adjust_avatar_price('70000000-0000-4000-8000-000000000003',null,-500,449);
do $$ begin
 if (select enabled from public.avatar_collections where id='70000000-0000-4000-8000-000000000003') then raise exception 'Zero base still enabled'; end if;
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='70000000-0000-4000-8000-000000000004')<>0 then raise exception 'Zero base did not clear model price'; end if;
end $$;
select public.adjust_avatar_price('70000000-0000-4000-8000-000000000003',null,500,0);
do $$ begin
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='70000000-0000-4000-8000-000000000004')<>500 then raise exception 'Base-price restore mismatch'; end if;
 if has_function_privilege('anon','public.adjust_avatar_price(uuid,uuid,integer,numeric)','EXECUTE') then raise exception 'Anonymous can adjust'; end if;
end $$;
rollback;
