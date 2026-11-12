begin;

alter table public.avatar_purchases add column included_gold_burqa boolean not null default false;
alter table public.avatar_variants add column abaya_grade smallint not null default 0 check (abaya_grade between 0 and 4);
create temporary table avatar_shoe_prices (shoe_number integer generated always as identity, name text, price integer, variant_names text[], grades text) on commit drop;
insert into avatar_shoe_prices(name,price,variant_names,grades) values
 ('LV Olympia',9500,array['ليلة فضية','بريق أسود','ضوء القمر','قهوة المساء','ورد رمادي','أفق'],'123444'),
 ('Nike Vomero 5',1199,array['رونق','خيط أبيض','ألماس','سكون','طلة مطرزة','رمل ناعم'],'113224'),
 ('New Balance 530',649,array['سحر المها','عبق المسك','نعومة الحرير','مخمل الليل','كحل','ندى'],'342441'),
 ('Adidas Ultraboost',1299,array['هلال','مرآة الغيم','سَجى','وشاح الأصيل','ليلية','أريج'],'240442'),
 ('ASICS GEL-1130',599,array['دُرّة','ورق الياسمين','نغم','خيوط القمر','وهج','أثير'],'343442'),
 ('Nike P-6000',699,array['سواد حريري','سُلاف','نجمة بعيدة','مشهد','لمعة الكريستال','فجر'],'142443'),
 ('On Cloud 6',1099,array['سدرة','همسة ورد','ظلال النخيل','قطرة ندى','ترف','رِواء'],'143442'),
 ('New Balance 1906R',949,array['أنامل','موجة سوداء','لؤلؤة','نسق','إطلالة شتوية','لمسة دافئة'],'241442'),
 ('ASICS GEL-KAYANO 14',999,array['أرجوان','لحن المطر','سِوار','هُدوء','وشي الفضة','مزن'],'434433'),
 ('Nike Initiator',549,array['قَطيفة','أصداف','درب المساء','ريشة','شفق','ديباج'],'424411'),
 ('Adidas Puremotion 2.0',449,array['غيمة','نبض الحرير','وردة مخملية','سما','سيل','قَصّة واثقة'],'424412'),
 ('New Balance 2002R',899,array['جمان','زهر اللوز','أشرعة','شال الليل','رُبى','حبات المطر'],'434422'),
 ('On Cloudtilt',1299,array['سحاب','طيف','انسياب','خاتم فضي','عبير الخزامى','جوري'],'414403'),
 ('Nike Motiva',749,array['لمار','ورد الحجاز','مدى','إيقاع','ياقوت','نفحة'],'424432'),
 ('ASICS GT-2160',749,array['حور','غيمة المسك','فخامة هادئة','نُهى','حبر','إشراقة'],'244124'),
 ('Adidas Supernova Rise',749,array['أصالة','تاج من دانتيل','بيلسان','عطر البرتقال','نقاء','ضفيرة'],'044234'),
 ('New Balance Fresh Foam X 1080',1399,array['غسق','حرير مطفي','طيّة ناعمة','ليلك','دانة','شُعاع'],'344214'),
 ('Nike Pegasus',899,array['صباح الرياض','مِهاد','عسجد','ندى الورد','ليل كحلي','مرافئ'],'244314'),
 ('HOKA Clifton',1249,array['ميسم','وتين','سِدر','أسرار المطر','حافة من حرير','لمعة خافتة'],'344224'),
 ('On Cloudnova 2',1199,array['عنبر','ريش أسود','ليل نجد','مودة','مِداد','قطرة ذهب'],'144204'),
 ('ASICS GEL-NYC',949,array['ريما','مهابة','غيوم المساء','خيوط العنبر','أندلس','رِقّة'],'443342'),
 ('Adidas Duramo SL',449,array['موج','لون الغروب','أسود صافي','شِعر','رسم الحواف','نجوم متناثرة'],'440142'),
 ('New Balance 9060',1199,array['إيناس','كاميليا','زخرف','منمنمة','طلة ربيعية','قمرية'],'441243'),
 ('Nike Revolution',349,array['ليل فحمي','موكا','عقيق أسود','مطرزة بورود','كحلي هادئ','سادة'],'442240'),
 ('HOKA Bondi',1399,array['تالا','مهاوي','عنقود','سوار مخملي','بريق اللؤلؤ','أمواج'],'440342'),
 ('Puma RS-X',649,array['بيادر','مَها','خاتون','خيطان','أريام','قهوة بالحليب'],'443242'),
 ('Skechers GO WALK Arch Fit',449,array['بَشاير','خُزامى','مساء هادئ','عِقد','دارين','سحر التطريز'],'412404'),
 ('New Balance Fresh Foam Arishi',549,array['ترانيم','وصال','مقاس الليل','زهر الرمان','كريب ناعم','أطياف'],'423434'),
 ('Salomon XT-6',1999,array['بنّ محمّص','كُحيلة','أكمام مطرزة','ليل بنفسجي','مسار الفضة','فحم ونجوم'],'421424'),
 ('Adidas NMD_R1',849,array['ديم','الأفق البعيد','ألق','شذى','ورق الورد','حكاية الحرير'],'431434');
update public.avatar_collections set name='LV Olympia' where lower(trim(name))='nike v2k run';
update public.avatar_collections c set price=s.price from avatar_shoe_prices s where lower(trim(c.name))=lower(s.name);
update public.avatar_collections set price=greatest(349,least(1999,round(price))) where lower(trim(name))<>'lv olympia' and (price<349 or price>1999 or price<>round(price));
alter table public.avatar_collections add constraint avatar_base_price_range check (not enabled or (price=round(price) and (case when lower(trim(name))='lv olympia' then price=9500 else price between 349 and 1999 end)));
-- Register the artwork already shipped with the application as saleable variants.
alter table public.avatar_variants drop constraint avatar_variants_image_path_check;
alter table public.avatar_variants add constraint avatar_variants_image_path_check check (
 image_path ~ '^[a-f0-9-]{36}[.]webp$'
 or image_path ~ '^bundled/(saudi-dark-v1/avatar-[0-9]{2}-[a-f][.]webp|saudi-abaya-lv-olympia-gold-v1/avatar-01-[a-f][.]png|saudi-abaya-nike-vomero-v1/avatar-02-[a-f][.]webp)$'
);
with added as (
 insert into public.avatar_collections(name,price,enabled)
 select s.name,s.price,true from avatar_shoe_prices s
 where not exists(select 1 from public.avatar_collections c where lower(trim(c.name))=lower(s.name))
 returning id,name
)
insert into public.avatar_variants(collection_id,name,image_path,abaya_grade)
select a.id,
 s.variant_names[v.position],
 'bundled/'||case s.shoe_number when 1 then 'saudi-abaya-lv-olympia-gold-v1' when 2 then 'saudi-abaya-nike-vomero-v1' else 'saudi-dark-v1' end
 ||'/avatar-'||lpad(s.shoe_number::text,2,'0')||'-'||v.suffix||case when s.shoe_number=1 then '.png' else '.webp' end,
 substring(s.grades from v.position::integer for 1)::smallint
from added a join avatar_shoe_prices s on s.name=a.name
cross join unnest(array['a','b','c','d','e','f']) with ordinality v(suffix,position);
update public.employee_feature_settings set data=data||'{"silverAt":8,"goldAt":11}'::jsonb where id=1;

create table private.gold_avatar_upgrades (
 variant_id uuid primary key references public.avatar_purchases(variant_id),
 price_paid numeric(12,2) not null check (price_paid between 0 and 9500),
 requested_at timestamptz not null default clock_timestamp(),
 fulfilled_at timestamptz,
 image_path text unique,
 check ((fulfilled_at is null)=(image_path is null))
);
alter table private.gold_avatar_upgrades enable row level security;
revoke all on private.gold_avatar_upgrades from public,anon,authenticated;

create function public.set_avatar_abaya_grade(variant uuid, requested_grade integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested_grade is null or requested_grade not between 0 and 4 then raise invalid_parameter_value; end if;
 update public.avatar_variants set abaya_grade=requested_grade where id=variant;
 if not found then raise invalid_parameter_value; end if;
end $$;

create function public.purchase_gold_avatar(variant uuid, expected_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare actor text:=private.account_profile(); cost constant numeric:=9500;
begin
 if auth.uid() is null or private.account_role() is distinct from 'employee' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.employee_feature_settings where id=1 and data->'avatars'='true'::jsonb for share;
 if not found then raise insufficient_privilege; end if;
 perform 1 from public.avatar_purchases where variant_id=variant and profile_id=actor and not included_gold_burqa;
 if not found then raise insufficient_privilege; end if;
 if exists(select 1 from private.gold_avatar_upgrades where variant_id=variant) then raise unique_violation; end if;
 if expected_price is distinct from cost then raise exception 'Price changed' using errcode='PT409'; end if;
 lock table public.reviews in share mode;
 if coalesce((private.avatar_wallet(actor)->>'available')::numeric,0)<cost then raise invalid_parameter_value; end if;
 insert into private.gold_avatar_upgrades(variant_id,price_paid) values(variant,cost);
end $$;


create or replace function public.save_avatar_collection(collection_id uuid,requested_name text,requested_price numeric,requested_enabled boolean,expected jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actual public.avatar_collections; result uuid;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_name is null or length(trim(requested_name)) not between 1 and 100 or requested_price is null or requested_price<0 or requested_price>1000000
   or requested_price<>round(requested_price,2) or requested_enabled is null
   or (requested_enabled and (requested_price<349 or requested_price<>round(requested_price) or (case when lower(trim(requested_name))='lv olympia' then requested_price<>9500 else requested_price>1999 end))) then raise exception 'Invalid avatar' using errcode='22023'; end if;
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
 price:=collection.price+50*item.abaya_grade+case when lower(trim(collection.name))='lv olympia' then 499 else 0 end;
 if expected_price is distinct from price then raise exception 'Price changed' using errcode='PT409'; end if;
 -- Block concurrent source edits while validating current credit, without writing review data.
 lock table public.reviews in share mode;
 if (settings->>'tiers')::boolean is distinct from true or not exists(
   select 1 from private.employee_scores() s where s.profile_id=actor and s.points>=8
 ) then raise exception 'Silver tier required' using errcode='42501'; end if;
 funds:=(private.avatar_wallet(actor)->>'available')::numeric;
 if funds<price then raise exception 'Insufficient store balance' using errcode='22023'; end if;
 insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa) values(variant,actor,price,lower(trim(collection.name))='lv olympia');
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;

create or replace function public.save_employee_features(requested jsonb, expected jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actual jsonb;
begin
  if auth.uid() is null or private.account_role() is distinct from 'admin' then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if requested is null or jsonb_typeof(requested)<>'object' or
    not requested ?& array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt'] or
    requested-array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt','rounding','missions','branchBadges']<>'{}' or
    jsonb_typeof(requested->'silverAt')<>'number' or jsonb_typeof(requested->'goldAt')<>'number' or
    exists(select 1 from unnest(array['competition','balanceGrowth','tiers','avatars']) k where jsonb_typeof(requested->k)<>'boolean') or
    (requested ? 'rounding' and jsonb_typeof(requested->'rounding')<>'boolean') or
    (requested ? 'missions' and jsonb_typeof(requested->'missions')<>'boolean') or
    (requested ? 'branchBadges' and jsonb_typeof(requested->'branchBadges')<>'boolean') then
    raise exception 'Invalid feature settings' using errcode='22023';
  end if;
  if (requested->>'silverAt')::numeric<>8 or (requested->>'goldAt')::numeric<>11 then
    raise exception 'Invalid thresholds' using errcode='22023';
  end if;
  select data into actual from public.employee_feature_settings where id=1 for update;
  if actual is distinct from expected then raise exception 'write-conflict' using errcode='PT409'; end if;
  update public.employee_feature_settings
    set data=requested||jsonb_build_object('rounding',coalesce(requested->'rounding',actual->'rounding','false'::jsonb),
      'missions',coalesce(requested->'missions',actual->'missions','false'::jsonb),
      'branchBadges',coalesce(requested->'branchBadges',actual->'branchBadges','false'::jsonb)) where id=1;
end $$;

create or replace function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (select (private.employee_progression(profile)->>'coins')::numeric total),
 spending as (select coalesce(sum(price_paid),0) total from (
  select price_paid from public.avatar_purchases where profile_id=profile
  union all select price_paid from public.gem_purchases where profile_id=profile
  union all select u.price_paid from private.gold_avatar_upgrades u join public.avatar_purchases p on p.variant_id=u.variant_id where p.profile_id=profile
 ) p)
 select jsonb_build_object('earned',e.total,'spent',s.total,'available',greatest(0,e.total-s.total)) from earnings e cross join spending s;
$$;

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
 else v.image_path end),'price',c.price+50*v.abaya_grade+case when lower(trim(c.name))='lv olympia' then 499 else 0 end,'abayaGrade',v.abaya_grade,'includedGoldBurqa',coalesce(p.included_gold_burqa,false),'paidPrice',case when p.profile_id=actor then p.price_paid end,'goldUpgrade',case when p.profile_id=actor and (u.variant_id is not null or p.included_gold_burqa)
 then case when g.variant_id is not null then 'delivered' when p.included_gold_burqa or u.fulfilled_at is not null then 'locked' else 'pending' end end,'enabled',v.enabled,'ownerId',p.profile_id,'ownerName',pr.data->>'name') order by v.name,v.id),'[]') from public.avatar_variants v left join public.avatar_purchases p on p.variant_id=v.id left join private.gold_avatar_upgrades u on u.variant_id=v.id left join active_gold g on g.variant_id=v.id left join public.profiles pr on pr.id=p.profile_id where v.collection_id=c.id and (admin or v.enabled or p.profile_id=actor))) order by c.name,c.id),'[]') from public.avatar_collections c where admin or c.enabled or exists(select 1 from public.avatar_variants v join public.avatar_purchases p on p.variant_id=v.id where v.collection_id=c.id and p.profile_id=actor)),
 'wallet',case when private.account_role()='employee' then private.avatar_wallet(actor) else null end,
 'equipped',(select coalesce(jsonb_object_agg(e.profile_id,coalesce(g.image_path,case when coalesce(p.included_gold_burqa,false)
 then replace(v.image_path,'saudi-abaya-lv-olympia-gold-v1','saudi-abaya-lv-olympia-v1')
 else v.image_path end)),'{}') from public.avatar_equipped e join public.avatar_purchases p on p.variant_id=e.variant_id and p.profile_id=e.profile_id join public.avatar_variants v on v.id=e.variant_id left join active_gold g on g.variant_id=v.id),
 'goldRequests',case when admin then (select coalesce(jsonb_agg(jsonb_build_object('id',u.variant_id,'name',v.name,'imagePath',v.image_path) order by u.requested_at),'[]') from private.gold_avatar_upgrades u join public.avatar_variants v on v.id=u.variant_id where u.fulfilled_at is null) else '[]'::jsonb end,
 'selectedVariant',(select variant_id from public.avatar_equipped where profile_id=actor)) into result;
 return result||jsonb_build_object('magic',private.magic_state());
end $$;

create trigger gold_avatar_version after insert or update on private.gold_avatar_upgrades
for each statement execute function private.bump_version();

create function public.fulfill_gold_avatar(variant uuid, requested_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested_path is null or requested_path !~ '^[a-f0-9-]{36}[.]webp$'
   or exists(select 1 from public.avatar_variants where image_path=requested_path)
   or not exists(select 1 from storage.objects where bucket_id='avatar-store' and name=requested_path and metadata->>'mimetype'='image/webp')
 then raise invalid_parameter_value; end if;
 update private.gold_avatar_upgrades set image_path=requested_path, fulfilled_at=clock_timestamp()
 where variant_id=variant and fulfilled_at is null;
 if not found then raise invalid_parameter_value; end if;
end $$;

revoke all on function public.set_avatar_abaya_grade(uuid,integer),public.purchase_gold_avatar(uuid,numeric),public.fulfill_gold_avatar(uuid,text) from public,anon;
grant execute on function public.set_avatar_abaya_grade(uuid,integer),public.purchase_gold_avatar(uuid,numeric),public.fulfill_gold_avatar(uuid,text) to authenticated;
commit;
