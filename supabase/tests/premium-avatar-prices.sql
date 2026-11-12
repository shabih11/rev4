begin;
insert into public.profiles(id,data) values ('premium-price-admin','{"id":"premium-price-admin","name":"Premium test","role":"admin","branch":"جاليري"}');
insert into auth.users(id,email) values ('80000000-0000-4000-8000-000000000001','premium-price@example.invalid');
insert into public.user_access(uid,profile_id,role) values ('80000000-0000-4000-8000-000000000001','premium-price-admin','admin');
insert into public.avatar_collections(id,name,price) values ('80000000-0000-4000-8000-000000000002','LV Olympia',12499);
insert into public.avatar_variants(id,collection_id,name,image_path,abaya_grade,price_adjustment) values ('80000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000002','Premium test','80000000-0000-4000-8000-000000000003.webp',0,-499);
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',-50,12499);
reset role;
do $$ begin
 if (select enabled from public.avatar_variants where id='80000000-0000-4000-8000-000000000003') then raise exception 'Premium minimum did not hide on decrement'; end if;
end $$;
set local role authenticated;
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',50,0);
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',500,12499);
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',-500,12999);
reset role;
do $$ begin
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='80000000-0000-4000-8000-000000000003')<>12499 then raise exception 'Premium minimum mismatch'; end if;
end $$;
-- Even legacy grade/name edits cannot offer a positive premium price below the floor.
update public.avatar_variants set price_adjustment=-12000 where id='80000000-0000-4000-8000-000000000003';
do $$ begin
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='80000000-0000-4000-8000-000000000003')<>12499 then raise exception 'Premium floor bypassed'; end if;
end $$;
set local role authenticated;
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',50,12499);
reset role;
do $$ begin
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='80000000-0000-4000-8000-000000000003')<>12549 then raise exception 'Floor-adjusted step mismatch'; end if;
 if exists(select 1 from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where lower(trim(c.name))='lv olympia' and private.avatar_sale_price(c,v)>0 and private.avatar_sale_price(c,v)<12499) then raise exception 'Premium below minimum'; end if;
end $$;
set local role authenticated;
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',0,12549);
select public.adjust_avatar_price('80000000-0000-4000-8000-000000000002',null,0,12499);
reset role;
do $$ begin
 if (select enabled or price<>0 from public.avatar_collections where id='80000000-0000-4000-8000-000000000002') then raise exception 'Direct zero did not hide premium collection'; end if;
 if (select v.enabled or private.avatar_sale_price(c,v)<>0 from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='80000000-0000-4000-8000-000000000003') then raise exception 'Direct zero did not clear premium model'; end if;
end $$;
rollback;
