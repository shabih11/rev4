begin;

create function private.is_gold_avatar_art(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.gold_avatar_upgrades where image_path=path);
$$;
revoke all on function private.is_gold_avatar_art(text) from public,anon;
grant execute on function private.is_gold_avatar_art(text) to authenticated;
alter policy avatar_art_cleanup on storage.objects using (
 bucket_id='avatar-store' and (select private.account_role())='admin'
 and not exists(select 1 from public.avatar_variants v where v.image_path=storage.objects.name)
 and not private.is_gold_avatar_art(name)
);

alter table public.reviews add column gold_plus boolean not null default false;
create function private.mark_gold_plus_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare review_time timestamptz;
begin
 new.gold_plus:=false;
 if (new.data->>'rating')::integer not in (4,5) then return new; end if;
 if tg_op='UPDATE' and old.gold_plus
   and new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time' then
   new.gold_plus:=true;
 else
   review_time:=private.record_at(new.data->>'date',new.data->>'time');
   select exists(select 1 from (
     select p.profile_id,u.fulfilled_at active_at
     from private.gold_avatar_upgrades u join public.avatar_purchases p on p.variant_id=u.variant_id
     where u.fulfilled_at is not null
     union all
     select p.profile_id,p.purchased_at from public.avatar_purchases p where p.included_gold_burqa
   ) entitlement
   where entitlement.profile_id=any(new.employee_ids) and entitlement.active_at<=review_time
     and exists(select 1 from private.employee_scores(review_time) scores
       where scores.profile_id=entitlement.profile_id and scores.balance>=20)
   ) into new.gold_plus;
 end if;
 return new;
end $$;
revoke all on function private.mark_gold_plus_review() from public,anon,authenticated;
create trigger zz_gold_plus_review before insert or update on public.reviews
for each row execute function private.mark_gold_plus_review();

alter function public.get_read_model() set schema private;
alter function private.get_read_model() rename to read_model_before_gold_plus;
revoke all on function private.read_model_before_gold_plus() from public,anon,authenticated;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.read_model_before_gold_plus();
 return jsonb_set(result,'{reviews}',(
   select coalesce(jsonb_agg(case when r.gold_plus then item||'{"goldPlus":true}'::jsonb else item end order by item->>'id'),'[]'::jsonb)
   from jsonb_array_elements(result->'reviews') item left join public.reviews r on r.id=item->>'id'
 ));
end $$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;
commit;
