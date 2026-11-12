begin;
-- Change catalogue offers only; historical purchase amounts remain unchanged.
select pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
update public.avatar_variants v set price_adjustment=
 (case when private.avatar_sale_price(c,v)<=0 then 0 else greatest(12499,private.avatar_sale_price(c,v)) end)
 -(greatest(12499,c.price)+50*v.abaya_grade+499)
from public.avatar_collections c where c.id=v.collection_id and lower(trim(c.name))='lv olympia';
update public.avatar_collections set price=greatest(12499,price) where lower(trim(name))='lv olympia';
create or replace function private.avatar_sale_price(collection public.avatar_collections, variant public.avatar_variants) returns numeric
language sql immutable set search_path='' as $$
 select case when lower(trim(collection.name))='lv olympia' and raw_price>0 then greatest(12499,raw_price) else raw_price end
 from (select collection.price+50*variant.abaya_grade+variant.price_adjustment
  +case when lower(trim(collection.name))='lv olympia' then 499 else 0 end as raw_price) p;
$$;
revoke all on function private.avatar_sale_price(public.avatar_collections,public.avatar_variants) from public,anon,authenticated;
create or replace function public.adjust_avatar_price(requested_collection uuid, requested_variant uuid, step integer, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare collection public.avatar_collections; variant public.avatar_variants; current_price numeric; next_price numeric; minimum numeric; maximum numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if step is null or step not in (-500,-50,50,500) or expected_price is null then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select * into collection from public.avatar_collections where id=requested_collection for update;
 if not found then raise invalid_parameter_value; end if;
 minimum:=case when lower(trim(collection.name))='lv olympia' then 12499 else 0 end;
 maximum:=case when minimum>0 then 1000000 else 4000 end;
 if requested_variant is null then
  current_price:=collection.price;
 else
  select * into variant from public.avatar_variants where id=requested_variant and collection_id=requested_collection for update;
  if not found then raise invalid_parameter_value; end if;
  current_price:=private.avatar_sale_price(collection,variant);
 end if;
 if expected_price is distinct from current_price then raise exception 'write-conflict' using errcode='PT409'; end if;
 next_price:=case when step<0 and current_price<=minimum then 0 else greatest(minimum,least(maximum,current_price+step)) end;
 if requested_variant is null then
  -- Keep each variant inside the limits too, including its decoration surcharge.
  update public.avatar_variants v set
   price_adjustment=(case when next_price=0 then 0 else greatest(minimum,least(maximum,private.avatar_sale_price(collection,v)+next_price-current_price)) end)
     -(next_price+50*v.abaya_grade+case when lower(trim(collection.name))='lv olympia' then 499 else 0 end),
   enabled=next_price>0 and greatest(minimum,least(maximum,private.avatar_sale_price(collection,v)+next_price-current_price))>0
  where v.collection_id=collection.id;
  update public.avatar_collections set price=next_price,enabled=next_price>0 where id=collection.id;
 else
  update public.avatar_variants set price_adjustment=next_price-(collection.price+50*variant.abaya_grade+case when lower(trim(collection.name))='lv olympia' then 499 else 0 end),enabled=next_price>0 where id=variant.id;
 end if;
end $$;
revoke all on function public.adjust_avatar_price(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.adjust_avatar_price(uuid,uuid,integer,numeric) to authenticated;

commit;
