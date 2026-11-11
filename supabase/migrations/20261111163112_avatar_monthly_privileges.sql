begin;
-- Raise catalogue prices once; preserve historical amounts paid and ownership.
alter table public.avatar_collections drop constraint avatar_base_price_range;
update public.avatar_collections set price=price+1000;
alter table public.avatar_collections add constraint avatar_base_price_range
 check (price=round(price) and price between 50 and 1000000);
alter table public.avatar_variants add column price_adjustment integer not null default 0;

create function private.avatar_sale_price(collection public.avatar_collections, variant public.avatar_variants) returns numeric
language sql immutable set search_path='' as $$
 select collection.price+50*variant.abaya_grade+variant.price_adjustment
   +case when lower(trim(collection.name))='lv olympia' then 499 else 0 end;
$$;
revoke all on function private.avatar_sale_price(public.avatar_collections,public.avatar_variants) from public,anon,authenticated;

create function private.has_gold_avatar_privilege(profile text, cutoff timestamptz default now()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.avatar_purchases p where p.profile_id=profile and p.purchased_at<=cutoff
   and (p.included_gold_burqa or exists(select 1 from private.gold_avatar_upgrades u where u.variant_id=p.variant_id and u.price_paid>0 and u.requested_at<=cutoff)));
$$;
revoke all on function private.has_gold_avatar_privilege(text,timestamptz) from public,anon,authenticated;

-- Legacy clients cannot buy the privilege independently of its original collection.
create or replace function public.purchase_gold_avatar(variant uuid, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Gold privilege is included only with its original collection' using errcode='42501';
end $$;

create or replace function public.purchase_avatar(variant uuid,expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare actor text := private.account_profile(); item public.avatar_variants; collection public.avatar_collections; settings jsonb; funds numeric; price numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 -- Matches the existing profile/merge lock: purchases, merges, and selections cannot race.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select data into settings from public.employee_feature_settings where id=1 for share;
 if (settings->>'avatars')::boolean is distinct from true then raise exception 'Store disabled' using errcode='42501'; end if;
 select * into item from public.avatar_variants where id=variant for update;
 if not found or not item.enabled then raise exception 'Variant unavailable' using errcode='22023'; end if;
 select * into collection from public.avatar_collections where id=item.collection_id for share;
 if not collection.enabled then raise exception 'Avatar unavailable' using errcode='22023'; end if;
 if exists(select 1 from public.avatar_purchases where variant_id=variant) then raise exception 'Variant already owned' using errcode='23505'; end if;
 price:=private.avatar_sale_price(collection,item);
 if expected_price is distinct from price then raise exception 'Price changed' using errcode='PT409'; end if;
 -- Block concurrent source edits while validating current credit, without writing review data.
 lock table public.reviews in share mode;
 funds:=(private.avatar_wallet(actor)->>'available')::numeric;
 if funds<price then raise exception 'Insufficient store balance' using errcode='22023'; end if;
 insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa) values(variant,actor,price,lower(trim(collection.name))='lv olympia');
 if not (lower(trim(collection.name))='lv olympia') and private.has_gold_avatar_privilege(actor) then
   insert into private.gold_avatar_upgrades(variant_id,price_paid) values(variant,0);
 end if;
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;

create or replace function public.save_avatar_collection(collection_id uuid,requested_name text,requested_price numeric,requested_enabled boolean,expected jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actual public.avatar_collections; result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_name is null or length(trim(requested_name)) not between 1 and 100 or requested_price is null
   or requested_price not between 50 and 1000000 or requested_price<>round(requested_price) or requested_enabled is null
 then raise exception 'Invalid avatar' using errcode='22023'; end if;
 if collection_id is null then
  insert into public.avatar_collections(name,price,enabled) values(trim(requested_name),requested_price,requested_enabled) returning id into result;
 else
  select * into actual from public.avatar_collections where id=collection_id for update;
  if not found or expected is distinct from jsonb_build_object('name',actual.name,'price',actual.price,'enabled',actual.enabled) then raise exception 'write-conflict' using errcode='PT409'; end if;
  update public.avatar_collections set name=trim(requested_name),price=requested_price,enabled=requested_enabled where id=collection_id;
  result:=collection_id;
 end if;
 return result;
end $$;

create function public.adjust_avatar_price(requested_collection uuid, requested_variant uuid, step integer, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare collection public.avatar_collections; variant public.avatar_variants; current_price numeric;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if step is null or step not in (-50,50) then raise invalid_parameter_value; end if;
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
 if current_price+step not between 50 and 1000000 then raise invalid_parameter_value; end if;
 if requested_variant is null then
   if exists(select 1 from public.avatar_variants v where v.collection_id=collection.id
     and private.avatar_sale_price(collection,v)+step not between 50 and 1000000) then raise invalid_parameter_value; end if;
   update public.avatar_collections set price=price+step where id=collection.id;
 else
   update public.avatar_variants set price_adjustment=price_adjustment+step where id=variant.id;
 end if;
end $$;
revoke all on function public.adjust_avatar_price(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.adjust_avatar_price(uuid,uuid,integer,numeric) to authenticated;

create or replace function public.get_avatar_store() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor text := private.account_profile(); admin boolean := private.account_role()='admin';
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 with owned_gold as materialized (
   select u.variant_id,u.image_path,p.profile_id from private.gold_avatar_upgrades u
   join public.avatar_purchases p on p.variant_id=u.variant_id where u.fulfilled_at<=now()
   union all
   select p.variant_id,v.image_path,p.profile_id from public.avatar_purchases p
   join public.avatar_variants v on v.id=p.variant_id where p.included_gold_burqa
 ), active_gold as materialized (
   select g.variant_id,g.image_path from owned_gold g
   join private.employee_scores() scores on scores.profile_id=g.profile_id and scores.balance>=20
 )
 select jsonb_build_object('collections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price,'enabled',c.enabled,
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'imagePath',coalesce(g.image_path,case when coalesce(p.included_gold_burqa,false)
 then replace(v.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else v.image_path end),'price',private.avatar_sale_price(c,v),'abayaGrade',v.abaya_grade,'includedGoldBurqa',coalesce(p.included_gold_burqa,false),'paidPrice',case when p.profile_id=actor then p.price_paid end,'goldUpgrade',case when p.profile_id=actor and (u.variant_id is not null or p.included_gold_burqa)
 then case when g.variant_id is not null then 'delivered' when p.included_gold_burqa or u.fulfilled_at is not null then 'locked' else 'pending' end end,'enabled',v.enabled,'ownerId',p.profile_id,'ownerName',pr.data->>'name') order by v.name,v.id),'[]') from public.avatar_variants v left join public.avatar_purchases p on p.variant_id=v.id left join private.gold_avatar_upgrades u on u.variant_id=v.id left join active_gold g on g.variant_id=v.id left join public.profiles pr on pr.id=p.profile_id where v.collection_id=c.id and (admin or v.enabled or p.profile_id=actor))) order by c.name,c.id),'[]') from public.avatar_collections c where admin or c.enabled or exists(select 1 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id where v.collection_id=c.id and p.profile_id=actor)),
 'wallet',case when private.account_role()='employee' then private.avatar_wallet(actor) else null end,
 'equipped',(select coalesce(jsonb_object_agg(e.profile_id,coalesce(g.image_path,case when coalesce(p.included_gold_burqa,false)
 then replace(v.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else v.image_path end)),'{}') from public.avatar_equipped e join public.avatar_purchases p on p.variant_id=e.variant_id and p.profile_id=e.profile_id join public.avatar_variants v on v.id=e.variant_id left join active_gold g on g.variant_id=v.id),
 'goldRequests',case when admin then (select coalesce(jsonb_agg(jsonb_build_object('id',u.variant_id,'name',v.name,'imagePath',v.image_path) order by u.requested_at),'[]') from private.gold_avatar_upgrades u join public.avatar_variants v on v.id=u.variant_id where u.fulfilled_at is null) else '[]'::jsonb end,
 'selectedVariant',(select variant_id from public.avatar_equipped where profile_id=actor)) into result;
 return result||jsonb_build_object('magic',private.magic_state(),'goldEntitled',private.has_gold_avatar_privilege(actor));
end $$;

-- Snapshot recipients on the review; never transfer a shared review's benefit to a colleague.
alter table public.reviews add column avatar_reward_employee_ids text[];
create function private.avatar_review_eligible(profile text, cutoff timestamptz, excluded_review text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.avatar_purchases p where p.profile_id=profile
   and p.purchased_at>=date_trunc('month',cutoff at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
   and p.purchased_at<=cutoff)
 and exists(select 1 from private.employee_scores(cutoff) scores where scores.profile_id=profile
   and scores.balance-coalesce((select 1.0/cardinality(r.employee_ids) from public.reviews r
     where r.id=excluded_review and profile=any(r.employee_ids) and r.rating>=4
       and r.occurred_at<cutoff and date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')=date_trunc('month',cutoff at time zone 'Asia/Riyadh')),0)>=20);
$$;
revoke all on function private.avatar_review_eligible(text,timestamptz,text) from public,anon,authenticated;
create function private.mark_avatar_reward_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare review_time timestamptz;
begin
 if tg_op='UPDATE' then
   if new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time'
     and new.data->>'rating'=old.data->>'rating' and new.employee_ids=old.employee_ids then
     new.avatar_reward_employee_ids:=old.avatar_reward_employee_ids;
     return new;
   end if;
 end if;
 new.avatar_reward_employee_ids:='{}';
 if (new.data->>'rating')::integer not in (4,5) then return new; end if;
 review_time:=private.record_at(new.data->>'date',new.data->>'time');
 -- A future review cannot pre-book the benefit; eligibility is evaluated at entry too.
 select coalesce(array_agg(profile order by profile),'{}') into new.avatar_reward_employee_ids
 from unnest(new.employee_ids) profile
 where private.avatar_review_eligible(profile,least(review_time,clock_timestamp()),new.id);
 return new;
end $$;
revoke all on function private.mark_avatar_reward_review() from public,anon,authenticated;
create trigger zz_avatar_reward_review before insert or update on public.reviews
 for each row execute function private.mark_avatar_reward_review();

alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_avatar_rewards;
revoke all on function private.read_model_before_avatar_rewards() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.read_model_before_avatar_rewards();
 return jsonb_set(result,'{reviews}',(
   select coalesce(jsonb_agg(case when r.avatar_reward_employee_ids is not null
     then item||jsonb_build_object('avatarRewardEmployeeIds',r.avatar_reward_employee_ids) else item end order by item->>'id'),'[]'::jsonb)
   from jsonb_array_elements(result->'reviews') item left join public.reviews r on r.id=item->>'id'
 ));
end $$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;
commit;
