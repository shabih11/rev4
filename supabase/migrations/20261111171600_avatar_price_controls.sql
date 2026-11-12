begin;
-- Preserve existing catalogue prices and amounts paid. Only explicit adjustments
-- use the new 0..4000 range; zero is never a free purchase.
alter table public.avatar_variants add column if not exists price_adjustment integer not null default 0;
alter table public.avatar_collections drop constraint avatar_base_price_range;
alter table public.avatar_collections add constraint avatar_base_price_range check (price=round(price) and price between 0 and 1000000);
create or replace function private.avatar_sale_price(collection public.avatar_collections, variant public.avatar_variants) returns numeric
language sql immutable set search_path='' as $$
 select collection.price+50*variant.abaya_grade+variant.price_adjustment
   +case when lower(trim(collection.name))='lv olympia' then 499 else 0 end;
$$;
revoke all on function private.avatar_sale_price(public.avatar_collections,public.avatar_variants) from public,anon,authenticated;

create or replace function public.adjust_avatar_price(requested_collection uuid, requested_variant uuid, step integer, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare collection public.avatar_collections; variant public.avatar_variants; current_price numeric; next_price numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if step is null or step not in (-500,-50,50,500) or expected_price is null then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select * into collection from public.avatar_collections where id=requested_collection for update;
 if not found then raise invalid_parameter_value; end if;
 if requested_variant is null then
  current_price:=collection.price;
 else
  select * into variant from public.avatar_variants where id=requested_variant and collection_id=requested_collection for update;
  if not found then raise invalid_parameter_value; end if;
  current_price:=private.avatar_sale_price(collection,variant);
 end if;
 if expected_price is distinct from current_price then raise exception 'write-conflict' using errcode='PT409'; end if;
 next_price:=greatest(0,least(4000,current_price+step));
 if requested_variant is null then
  -- Keep each variant inside the limits too, including its decoration surcharge.
  update public.avatar_variants v set
   price_adjustment=(case when next_price=0 then 0 else greatest(0,least(4000,private.avatar_sale_price(collection,v)+next_price-current_price)) end)
     -(next_price+50*v.abaya_grade+case when lower(trim(collection.name))='lv olympia' then 499 else 0 end),
   enabled=next_price>0 and greatest(0,least(4000,private.avatar_sale_price(collection,v)+next_price-current_price))>0
  where v.collection_id=collection.id;
  update public.avatar_collections set price=next_price,enabled=next_price>0 where id=collection.id;
 else
  update public.avatar_variants set price_adjustment=price_adjustment+next_price-current_price,enabled=next_price>0 where id=variant.id;
 end if;
end $$;
revoke all on function public.adjust_avatar_price(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.adjust_avatar_price(uuid,uuid,integer,numeric) to authenticated;

-- Upgrade the pricing expressions in place, preserving the installed gold
-- privileges, purchase checks, and read permissions across catalogue versions.
do $$ declare definition text; begin
 select pg_get_functiondef('public.get_avatar_store()'::regprocedure) into definition;
 definition:=replace(definition,'c.price+50*v.abaya_grade+case when lower(trim(c.name))=''lv olympia'' then 499 else 0 end','private.avatar_sale_price(c,v)');
 if position('private.avatar_sale_price(c,v)' in definition)=0 then raise exception 'Unknown store pricing expression'; end if;
 definition:=replace(definition,'''enabled'',v.enabled','''enabled'',v.enabled and private.avatar_sale_price(c,v)>0');
 definition:=replace(definition,'(admin or v.enabled or p.profile_id=actor)','(admin or (v.enabled and private.avatar_sale_price(c,v)>0) or p.profile_id=actor)');
 execute definition;
 select pg_get_functiondef('public.purchase_avatar(uuid,numeric)'::regprocedure) into definition;
 definition:=replace(definition,'collection.price+50*item.abaya_grade+case when lower(trim(collection.name))=''lv olympia'' then 499 else 0 end','private.avatar_sale_price(collection,item)');
 if position('price:=private.avatar_sale_price(collection,item)' in definition)=0 then raise exception 'Unknown purchase pricing expression'; end if;
 definition:=replace(definition,'if expected_price is distinct from price then','if price<=0 then raise exception ''Variant unavailable'' using errcode=''22023''; end if; if expected_price is distinct from price then');
 execute definition;
end $$;
commit;
