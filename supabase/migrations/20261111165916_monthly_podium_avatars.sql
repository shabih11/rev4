begin;
-- Private, append-only selections. NULL means the employee chose the default avatar.
create table private.avatar_selection_history (
 id bigint generated always as identity primary key,
 profile_id text not null references public.profiles(id) on delete cascade,
 variant_id uuid references public.avatar_variants(id) on delete restrict,
 image_path text,
 included_gold_burqa boolean not null default false,
 selected_at timestamptz not null default clock_timestamp(),
 check ((variant_id is null) = (image_path is null))
);
alter table private.avatar_selection_history enable row level security;
revoke all on private.avatar_selection_history from public,anon,authenticated;
create index avatar_selection_history_owner_time on private.avatar_selection_history(profile_id,selected_at desc,id desc);

-- Purchases automatically equip their variant. This is the only dated evidence
-- available before selection tracking; old manual switches cannot be reconstructed.
insert into private.avatar_selection_history(profile_id,variant_id,image_path,included_gold_burqa,selected_at)
select p.profile_id,p.variant_id,v.image_path,p.included_gold_burqa,p.purchased_at
from public.avatar_purchases p join public.avatar_variants v on v.id=p.variant_id order by p.purchased_at,p.variant_id;
-- Establish today's actual selection, including employees using the default.
insert into private.avatar_selection_history(profile_id,variant_id,image_path,included_gold_burqa)
select pr.id,e.variant_id,v.image_path,coalesce(p.included_gold_burqa,false)
from public.profiles pr left join public.avatar_equipped e on e.profile_id=pr.id
left join public.avatar_variants v on v.id=e.variant_id
left join public.avatar_purchases p on p.variant_id=e.variant_id
where pr.data->>'role'='employee';

create function private.record_avatar_selection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.profile_id=old.profile_id and new.variant_id=old.variant_id then return new; end if;
 if TG_OP='DELETE' then
  -- A cascading profile deletion must not recreate its history.
  if exists(select 1 from public.profiles where id=old.profile_id) then
   insert into private.avatar_selection_history(profile_id) values(old.profile_id);
  end if;
  return old;
 end if;
 insert into private.avatar_selection_history(profile_id,variant_id,image_path,included_gold_burqa)
 select new.profile_id,new.variant_id,v.image_path,p.included_gold_burqa
 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id and p.profile_id=new.profile_id
 where v.id=new.variant_id;
 return new;
end $$;
revoke all on function private.record_avatar_selection() from public,anon,authenticated;
create trigger avatar_selection_history after insert or update or delete on public.avatar_equipped
for each row execute function private.record_avatar_selection();

create function public.get_monthly_avatars(requested_month date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz; result jsonb;
begin
 if auth.uid() is null or private.account_role() is null then raise insufficient_privilege; end if;
 if requested_month is null or requested_month<>date_trunc('month',requested_month)::date
 or requested_month<date '2000-01-01' or requested_month>=date_trunc('month',now() at time zone 'Asia/Riyadh')::date
 then raise invalid_parameter_value; end if;
 cutoff:=((requested_month+interval '1 month') at time zone 'Asia/Riyadh')-interval '1 microsecond';
 with selections as (
  select distinct on (h.profile_id) h.* from private.avatar_selection_history h
  where h.selected_at<=cutoff order by h.profile_id,h.selected_at desc,h.id desc
 ), scores as materialized (select * from private.employee_scores(cutoff))
 select coalesce(jsonb_object_agg(s.profile_id,case when s.variant_id is null then null
 when coalesce(sc.balance,0)>=20 and u.fulfilled_at<=cutoff then u.image_path
 when s.included_gold_burqa and coalesce(sc.balance,0)>=20 then s.image_path
 when s.included_gold_burqa then replace(s.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else s.image_path end),'{}') into result
 from selections s left join private.gold_avatar_upgrades u on u.variant_id=s.variant_id
 left join scores sc on sc.profile_id=s.profile_id;
 return result;
end $$;
revoke all on function public.get_monthly_avatars(date) from public,anon;
grant execute on function public.get_monthly_avatars(date) to authenticated;
commit;
