-- Independent opt-in mystery boxes and visitor themes. All writes are authenticated RPCs.
create table public.magic_settings(id integer primary key check(id=1), data jsonb not null);
insert into public.magic_settings values(1,'{"boxes":false,"themes":false,"price":50}');
create table public.gem_purchases(
 id uuid primary key, profile_id text not null references public.profiles(id),
 gem text not null check(gem in ('amber','pearl','emerald','sapphire','rose','amethyst')),
 price_paid numeric(12,2) not null check(price_paid>=0), created_at timestamptz not null default now()
);
create index gem_purchases_profile on public.gem_purchases(profile_id);
create table public.gem_equipped(profile_id text primary key references public.profiles(id), gem text not null check(gem in ('amber','pearl','emerald','sapphire','rose','amethyst')));
alter table public.magic_settings enable row level security;
alter table public.gem_purchases enable row level security;
alter table public.gem_equipped enable row level security;
revoke all on public.magic_settings,public.gem_purchases,public.gem_equipped from public,anon,authenticated;
create trigger magic_settings_version after update on public.magic_settings for each statement execute function private.bump_version();
create trigger gem_purchases_version after insert or update or delete on public.gem_purchases for each statement execute function private.bump_version();
create trigger gem_equipped_version after insert or update or delete on public.gem_equipped for each statement execute function private.bump_version();
create or replace function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (select coalesce(sum(rating),0) total from public.reviews where rating between 3 and 5 and profile=any(employee_ids) and occurred_at<=now()),
 spending as (select coalesce(sum(price_paid),0) total from (select price_paid from public.avatar_purchases where profile_id=profile union all select price_paid from public.gem_purchases where profile_id=profile) p)
 select jsonb_build_object('earned',e.total,'spent',s.total,'available',greatest(0,e.total-s.total)) from earnings e cross join spending s;
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
create function private.magic_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('settings',(select data from public.magic_settings where id=1),
 'owned',(select coalesce(jsonb_agg(jsonb_build_object('gem',gem,'count',n) order by gem),'[]') from (select gem,count(*) n from public.gem_purchases where profile_id=private.account_profile() group by gem) p),
 'equipped',(select coalesce(jsonb_object_agg(profile_id,gem),'{}') from public.gem_equipped),
 'selected',(select gem from public.gem_equipped where profile_id=private.account_profile()));
$$;
revoke all on function private.magic_state() from public,anon,authenticated;
create function public.save_magic_settings(requested jsonb,expected jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested is null or jsonb_typeof(requested)<>'object' or not requested ?& array['boxes','themes','price'] or requested-array['boxes','themes','price']<>'{}' or jsonb_typeof(requested->'boxes')<>'boolean' or jsonb_typeof(requested->'themes')<>'boolean' or jsonb_typeof(requested->'price')<>'number' then raise exception 'Invalid settings' using errcode='22023'; end if;
 if (requested->>'price')::numeric not between 0 and 1000000 or trunc((requested->>'price')::numeric,2)<>(requested->>'price')::numeric then raise exception 'Invalid price' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 update public.magic_settings set data=requested where id=1 and data=expected;
 if not found then raise exception 'Settings changed' using errcode='40001'; end if;
end $$;
create function public.purchase_mystery_box(request_id uuid,expected_price numeric) returns text language plpgsql security definer set search_path='' as $$
declare actor text:=private.account_profile(); config jsonb; item public.gem_purchases; selected text; cost numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 if request_id is null or expected_price is null then raise exception 'Purchase required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select * into item from public.gem_purchases where id=request_id;
 if found then
  if item.profile_id<>actor then raise exception 'Request unavailable' using errcode='42501'; end if;
  return item.gem;
 end if;
 select data into config from public.magic_settings where id=1;
 if not (config->>'boxes')::boolean then raise exception 'Boxes disabled' using errcode='42501'; end if;
 cost:=(config->>'price')::numeric;
 if cost<>expected_price then raise exception 'Price changed' using errcode='40001'; end if;
 if (private.avatar_wallet(actor)->>'available')::numeric<cost then raise exception 'Insufficient credits' using errcode='22023'; end if;
 selected:=(array['amber','pearl','emerald','sapphire','rose','amethyst'])[1+floor(random()*6)::integer];
 insert into public.gem_purchases(id,profile_id,gem,price_paid) values(request_id,actor,selected,cost);
 insert into public.gem_equipped(profile_id,gem) values(actor,selected) on conflict(profile_id) do update set gem=excluded.gem;
 return selected;
end $$;
create function public.equip_gem(requested text) returns void language plpgsql security definer set search_path='' as $$
declare actor text:=private.account_profile();
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if not exists(select 1 from public.magic_settings where id=1 and (data->>'themes')::boolean) then raise exception 'Themes disabled' using errcode='42501'; end if;
 if requested is null then delete from public.gem_equipped where profile_id=actor; return; end if;
 if not exists(select 1 from public.gem_purchases where profile_id=actor and gem=requested) then raise exception 'Owned gem required' using errcode='42501'; end if;
 insert into public.gem_equipped(profile_id,gem) values(actor,requested) on conflict(profile_id) do update set gem=excluded.gem;
end $$;
revoke all on function public.save_magic_settings(jsonb,jsonb),public.purchase_mystery_box(uuid,numeric),public.equip_gem(text) from public,anon;
grant execute on function public.save_magic_settings(jsonb,jsonb),public.purchase_mystery_box(uuid,numeric),public.equip_gem(text) to authenticated;

create or replace function public.get_avatar_store() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor text := private.account_profile(); admin boolean := private.account_role()='admin';
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 select jsonb_build_object('collections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price,'enabled',c.enabled,
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'imagePath',v.image_path,'enabled',v.enabled,'ownerId',p.profile_id,'ownerName',pr.data->>'name') order by v.name,v.id),'[]') from public.avatar_variants v left join public.avatar_purchases p on p.variant_id=v.id left join public.profiles pr on pr.id=p.profile_id where v.collection_id=c.id and (admin or v.enabled or p.profile_id=actor))) order by c.name,c.id),'[]') from public.avatar_collections c where admin or c.enabled or exists(select 1 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id where v.collection_id=c.id and p.profile_id=actor)),
 'wallet',case when private.account_role()='employee' then private.avatar_wallet(actor) else null end,
 'equipped',(select coalesce(jsonb_object_agg(e.profile_id,v.image_path),'{}') from public.avatar_equipped e join public.avatar_purchases p on p.variant_id=e.variant_id and p.profile_id=e.profile_id join public.avatar_variants v on v.id=e.variant_id),
 'selectedVariant',(select variant_id from public.avatar_equipped where profile_id=actor)) into result;
 return result||jsonb_build_object('magic',private.magic_state());
end $$;

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
 -- Transfer gem purchases and preserve the primary employee's chosen theme.
 insert into public.gem_equipped(profile_id,gem) select primary_id,gem from public.gem_equipped where profile_id=duplicate_id on conflict(profile_id) do nothing;
 delete from public.gem_equipped where profile_id=duplicate_id;
 update public.gem_purchases set profile_id=primary_id where profile_id=duplicate_id;
 -- Transfer exclusive purchases before deleting the duplicate profile.
 delete from public.avatar_equipped where profile_id=duplicate_id returning variant_id into duplicate_avatar;
 update public.avatar_purchases set profile_id=primary_id where profile_id=duplicate_id;
 if duplicate_avatar is not null then
  insert into public.avatar_equipped(profile_id,variant_id) values(primary_id,duplicate_avatar) on conflict(profile_id) do nothing;
 end if;
 delete from public.profiles where id=duplicate_id;
end $$;

update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
