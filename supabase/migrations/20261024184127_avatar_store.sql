begin;
create table public.avatar_collections (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 price numeric(12,2) not null check(price>=0 and price<=1000000), enabled boolean not null default true
);
create table public.avatar_variants (
 id uuid primary key default gen_random_uuid(), collection_id uuid not null references public.avatar_collections(id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 100), image_path text not null unique check(image_path ~ '^[a-f0-9-]{36}\.webp$'),
 enabled boolean not null default true
);
create index avatar_variant_collection on public.avatar_variants(collection_id);
create table public.avatar_purchases (
 variant_id uuid primary key references public.avatar_variants(id) on delete restrict,
 profile_id text not null references public.profiles(id) on delete restrict,
 price_paid numeric(12,2) not null check(price_paid>=0), purchased_at timestamptz not null default now()
);
create index avatar_purchase_owner on public.avatar_purchases(profile_id);
create table public.avatar_equipped (
 profile_id text primary key references public.profiles(id) on delete cascade,
 variant_id uuid not null unique references public.avatar_purchases(variant_id) on delete restrict
);
do $$ declare tab text; begin
 foreach tab in array array['avatar_collections','avatar_variants','avatar_purchases','avatar_equipped'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
  execute format('create policy member_read on public.%I for select to authenticated using ((select private.account_role()) is not null)',tab);
  execute format('create trigger avatar_version after insert or update or delete on public.%I for each statement execute function private.bump_version()',tab);
 end loop;
end $$;

-- Immutable uploaded artwork. Even an administrator cannot overwrite a sold image at its path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('avatar-store','avatar-store',false,5242880,array['image/webp']);
create policy avatar_art_read on storage.objects for select to authenticated
 using(bucket_id='avatar-store' and (select private.account_role()) is not null);
create policy avatar_art_upload on storage.objects for insert to authenticated
 with check(bucket_id='avatar-store' and (select private.account_role())='admin' and name ~ '^[a-f0-9-]{36}\.webp$');
create policy avatar_art_cleanup on storage.objects for delete to authenticated
 using(bucket_id='avatar-store' and (select private.account_role())='admin' and not exists(select 1 from public.avatar_variants v where v.image_path=storage.objects.name));

create function public.save_avatar_collection(collection_id uuid,requested_name text,requested_price numeric,requested_enabled boolean,expected jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actual public.avatar_collections; result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_name is null or length(trim(requested_name)) not between 1 and 100 or requested_price is null or requested_price<0 or requested_price>1000000 or requested_price<>round(requested_price,2) or requested_enabled is null then raise exception 'Invalid avatar' using errcode='22023'; end if;
 if collection_id is null then
  insert into public.avatar_collections(name,price,enabled) values(trim(requested_name),requested_price,requested_enabled) returning id into result;
 else
  select * into actual from public.avatar_collections where id=collection_id for update;
  if not found or expected is distinct from jsonb_build_object('name',actual.name,'price',actual.price,'enabled',actual.enabled) then raise exception 'write-conflict' using errcode='40001'; end if;
  update public.avatar_collections set name=trim(requested_name),price=requested_price,enabled=requested_enabled where id=collection_id;
  result:=collection_id;
 end if;
 return result;
end $$;
create function public.add_avatar_variant(collection_id uuid,requested_name text,requested_path text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_name is null or length(trim(requested_name)) not between 1 and 100 or requested_path is null or requested_path !~ '^[a-f0-9-]{36}\.webp$' then raise exception 'Invalid variant' using errcode='22023'; end if;
 perform 1 from public.avatar_collections where id=collection_id for update;
 if not found then raise exception 'Avatar unavailable' using errcode='22023'; end if;
 if (select count(*) from public.avatar_variants v where v.collection_id=add_avatar_variant.collection_id)>=50 then raise exception 'Variant limit reached' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='avatar-store' and name=requested_path and metadata->>'mimetype'='image/webp') then raise exception 'Upload required' using errcode='22023'; end if;
 insert into public.avatar_variants(collection_id,name,image_path) values(add_avatar_variant.collection_id,trim(requested_name),requested_path) returning id into result;
 return result;
end $$;
create function public.set_avatar_variant_enabled(variant uuid,requested_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_enabled is null then raise exception 'Invalid visibility' using errcode='22023'; end if;
 update public.avatar_variants set enabled=requested_enabled where id=variant;
 if not found then raise exception 'Variant unavailable' using errcode='22023'; end if;
end $$;

-- Purchase currency is the cumulative positive-review share. Spending never changes rankings.
create function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (select coalesce(trunc(sum(1.0/cardinality(employee_ids)),2),0) total from public.reviews where rating>=4 and profile=any(employee_ids) and occurred_at<=now()),
 spending as (select coalesce(sum(price_paid),0) total from public.avatar_purchases where profile_id=profile)
 select jsonb_build_object('earned',e.total,'spent',s.total,'available',greatest(0,e.total-s.total)) from earnings e cross join spending s;
$$;
create function public.purchase_avatar(variant uuid,expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare actor text := private.account_profile(); item public.avatar_variants; collection public.avatar_collections; settings jsonb; funds numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 -- Matches the existing profile/merge lock: purchases, merges, and selections cannot race.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select data into settings from public.employee_feature_settings where id=1 for share;
 if not (settings->>'avatars')::boolean then raise exception 'Store disabled' using errcode='42501'; end if;
 select * into item from public.avatar_variants where id=variant for update;
 if not found or not item.enabled then raise exception 'Variant unavailable' using errcode='22023'; end if;
 select * into collection from public.avatar_collections where id=item.collection_id for share;
 if not collection.enabled then raise exception 'Avatar unavailable' using errcode='22023'; end if;
 if exists(select 1 from public.avatar_purchases where variant_id=variant) then raise exception 'Variant already owned' using errcode='23505'; end if;
 if expected_price is distinct from collection.price then raise exception 'Price changed' using errcode='40001'; end if;
 -- Block concurrent source edits while validating current credit, without writing review data.
 lock table public.reviews in share mode;
 funds:=(private.avatar_wallet(actor)->>'available')::numeric;
 if funds<collection.price then raise exception 'Insufficient store balance' using errcode='22023'; end if;
 insert into public.avatar_purchases(variant_id,profile_id,price_paid) values(variant,actor,collection.price);
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;
create function public.equip_avatar(variant uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor text := private.account_profile();
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if not exists(select 1 from public.employee_feature_settings where id=1 and (data->>'avatars')::boolean) then raise exception 'Store disabled' using errcode='42501'; end if;
 if variant is null then delete from public.avatar_equipped where profile_id=actor; return; end if;
 if not exists(select 1 from public.avatar_purchases where variant_id=variant and profile_id=actor) then raise exception 'Owned variant required' using errcode='42501'; end if;
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;
create function public.get_avatar_store() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor text := private.account_profile(); admin boolean := private.account_role()='admin';
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 select jsonb_build_object('collections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price,'enabled',c.enabled,
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'imagePath',v.image_path,'enabled',v.enabled,'ownerId',p.profile_id,'ownerName',pr.data->>'name') order by v.name,v.id),'[]') from public.avatar_variants v left join public.avatar_purchases p on p.variant_id=v.id left join public.profiles pr on pr.id=p.profile_id where v.collection_id=c.id and (admin or v.enabled or p.profile_id=actor))) order by c.name,c.id),'[]') from public.avatar_collections c where admin or c.enabled or exists(select 1 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id where v.collection_id=c.id and p.profile_id=actor)),
 'wallet',case when private.account_role()='employee' then private.avatar_wallet(actor) else null end,
 'equipped',(select coalesce(jsonb_object_agg(e.profile_id,v.image_path),'{}') from public.avatar_equipped e join public.avatar_purchases p on p.variant_id=e.variant_id and p.profile_id=e.profile_id join public.avatar_variants v on v.id=e.variant_id),
 'selectedVariant',(select variant_id from public.avatar_equipped where profile_id=actor)) into result;
 return result;
end $$;
create or replace function public.get_employee_features() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 -- Reconstruct yesterday from today's records, including historical imports and current manual adjustments.
 select jsonb_build_object('settings',s.data,'baselineDay',(now() at time zone 'Asia/Riyadh')::date,
 'comparisonSource',case when b.day is null then 'records' else 'snapshot' end,
 'baseline',coalesce(b.balances,(select coalesce(jsonb_object_agg(profile_id,balance),'{}') from private.employee_scores(((now() at time zone 'Asia/Riyadh')::date)::timestamp at time zone 'Asia/Riyadh'))),
 'store',public.get_avatar_store()) into result from public.employee_feature_settings s left join private.employee_daily_baselines b on b.day=(now() at time zone 'Asia/Riyadh')::date where s.id=1;
 return result;
end $$;
-- Accessory writes are retired; ownership and selections now go through the store.
revoke execute on function public.save_my_accessories(text[]) from authenticated;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
revoke all on function public.save_avatar_collection(uuid,text,numeric,boolean,jsonb),public.add_avatar_variant(uuid,text,text),public.set_avatar_variant_enabled(uuid,boolean),public.purchase_avatar(uuid,numeric),public.equip_avatar(uuid),public.get_avatar_store() from public,anon,authenticated;
grant execute on function public.save_avatar_collection(uuid,text,numeric,boolean,jsonb),public.add_avatar_variant(uuid,text,text),public.set_avatar_variant_enabled(uuid,boolean),public.purchase_avatar(uuid,numeric),public.equip_avatar(uuid),public.get_avatar_store() to authenticated;

create or replace function public.merge_employees(primary_id text, duplicate_id text, requested_name text, requested_branch text) returns void
language plpgsql security definer set search_path = '' as $$
declare first_profile jsonb; second_profile jsonb; aliases jsonb; branches jsonb; manual jsonb; duplicate_avatar uuid;
begin
 if private.account_role() is distinct from 'admin' or auth.uid() is null then raise exception 'Admin required' using errcode='42501'; end if;
 if primary_id=duplicate_id then raise exception 'Different identities required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.profiles where id in (primary_id,duplicate_id) order by id for update;
 select data into first_profile from public.profiles where id=primary_id;
 select data into second_profile from public.profiles where id=duplicate_id;
 if first_profile is null or second_profile is null or first_profile->>'role'<>'employee' or second_profile->>'role'<>'employee' or exists(select 1 from public.user_access where profile_id in (primary_id,duplicate_id) and role<>'employee') then raise exception 'Employee identities required'; end if;
 if length(trim(requested_name)) not between 1 and 120 or not (requested_branch='موظفة خارجية' or exists(select 1 from public.branches where id=requested_branch)) then raise exception 'Invalid merged profile'; end if;
 select coalesce(jsonb_agg(x order by x),'[]') into aliases from
  (select distinct value x from jsonb_array_elements_text(coalesce(first_profile->'aliases','[]')||coalesce(second_profile->'aliases','[]')||jsonb_build_array(first_profile->>'name',second_profile->>'name')) where value<>trim(requested_name)) a;
 select coalesce(jsonb_agg(x order by x),'[]') into branches from
  (select distinct value x from jsonb_array_elements_text(coalesce(first_profile->'assignedBranches','[]')||coalesce(second_profile->'assignedBranches','[]')||jsonb_build_array(first_profile->>'branch',second_profile->>'branch')) where value<>'موظفة خارجية' and value<>'') b;
 select jsonb_object_agg(k,coalesce((first_profile#>>array['manualStats',k])::numeric,0)+coalesce((second_profile#>>array['manualStats',k])::numeric,0)) into manual from unnest(array['positive','negative','complaints','safety','totalReviews','monthReviews']) k;
 update public.profiles set data=data||jsonb_build_object('name',trim(requested_name),'branch',requested_branch,'aliases',aliases,'assignedBranches',branches,'manualStats',manual) where id=primary_id;
 update public.timeline_events t set data=jsonb_set(t.data,'{employees}',(select jsonb_agg(jsonb_build_object('id',member,'name',case when member=primary_id then trim(requested_name) else (select data->>'name' from public.profiles where id=member) end) order by member) from (select distinct case when x=duplicate_id then primary_id else x end member from unnest(t.employee_ids) x) members)) where t.kind<>'review' and duplicate_id=any(t.employee_ids);
 update public.reviews r set data=jsonb_set(r.data,'{linkedEmployeeIds}',(select jsonb_agg(member order by member) from (select distinct case when x=duplicate_id then primary_id else x end member from unnest(r.employee_ids) x) members)) where duplicate_id=any(r.employee_ids);
 update public.user_access set branch=requested_branch where profile_id=primary_id and requested_branch<>'موظفة خارجية';
 -- Transfer exclusive purchases before deleting the duplicate profile.
 delete from public.avatar_equipped where profile_id=duplicate_id returning variant_id into duplicate_avatar;
 update public.avatar_purchases set profile_id=primary_id where profile_id=duplicate_id;
 if duplicate_avatar is not null then
  insert into public.avatar_equipped(profile_id,variant_id) values(primary_id,duplicate_avatar) on conflict(profile_id) do nothing;
 end if;
 delete from public.profiles where id=duplicate_id;
end $$;

update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
