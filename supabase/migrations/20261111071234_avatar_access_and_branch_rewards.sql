begin;
alter table private.branch_badge_rewards drop constraint branch_badge_rewards_badge_check;
alter table private.branch_badge_rewards add constraint branch_badge_rewards_badge_check check(badge in ('coffee','rocket','milestone','milestone500'));
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
 funds:=(private.avatar_wallet(actor)->>'available')::numeric;
 if funds<price then raise exception 'Insufficient store balance' using errcode='22023'; end if;
 insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa) values(variant,actor,price,lower(trim(collection.name))='lv olympia');
 insert into public.avatar_equipped(profile_id,variant_id) values(actor,variant) on conflict(profile_id) do update set variant_id=excluded.variant_id;
end $$;

-- Explicit recipients; clients cannot award themselves or choose another branch's staff.
create table private.branch_badge_reward_recipients (
 branch text not null,
 badge text not null,
 period date not null,
 profile_id text not null references public.profiles(id),
 approved_at timestamptz not null default clock_timestamp(),
 primary key(branch,badge,period,profile_id),
 foreign key(branch,badge,period) references private.branch_badge_rewards(branch,badge,period)
);
alter table private.branch_badge_reward_recipients enable row level security;
revoke all on private.branch_badge_reward_recipients from public,anon,authenticated;
create trigger branch_badge_recipient_version after insert on private.branch_badge_reward_recipients
for each statement execute function private.bump_version();
drop function public.approve_branch_badge_reward(text,text);
create function public.approve_branch_badge_reward(requested_branch text, requested_badge text, requested_employee_ids text[]) returns void
language plpgsql security definer set search_path='' as $$
declare award_period date;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested_badge is null or requested_badge not in ('milestone','milestone500')
 or requested_employee_ids is null or cardinality(requested_employee_ids) not between 1 and 1000 then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if (select count(*) from public.profiles p where p.id=any(requested_employee_ids)
   and p.data->>'role'='employee' and p.data->>'branch'=requested_branch)<>cardinality(requested_employee_ids)
 then raise invalid_parameter_value; end if;
 if (select count(*) from public.reviews where branch=requested_branch and occurred_at<=now())
 <(case when requested_badge='milestone' then 1000 else 500 end) then raise invalid_parameter_value; end if;
 select b.period into award_period from private.branch_badge_rewards b
 where b.branch=requested_branch and b.badge=requested_badge order by b.approved_at limit 1;
 if award_period is null then
  award_period:=date '2026-11-01';
  insert into private.branch_badge_rewards(branch,badge,period) values(requested_branch,requested_badge,award_period);
 end if;
 insert into private.branch_badge_reward_recipients(branch,badge,period,profile_id)
 select requested_branch,requested_badge,award_period,id from unnest(requested_employee_ids) id
 on conflict do nothing;
end $$;
revoke all on function public.approve_branch_badge_reward(text,text,text[]) from public,anon;
grant execute on function public.approve_branch_badge_reward(text,text,text[]) to authenticated;

-- Derive task badges from reviews; no administrator action or mutable award flag.
create function private.earned_branch_badges(cutoff date)
returns table(branch text,badge text,period date,approved_at timestamptz)
language sql stable security definer set search_path='' as $$
 with eligible as (
  select r.branch,r.occurred_at,(r.occurred_at at time zone 'Asia/Riyadh')::date as day
  from public.reviews r
  where r.occurred_at<least(now(),(cutoff+1)::timestamp at time zone 'Asia/Riyadh')
 ), rocket_windows as (
  select e.*,count(*) over(partition by e.branch order by e.day range between interval '6 days' preceding and current row) total
  from eligible e
 ), rocket as (
  select r.branch,'rocket'::text badge,date_trunc('month',r.day)::date period,max(r.occurred_at) approved_at
  from rocket_windows r where total>=100 and r.day>=date '2026-11-01'
  group by r.branch,date_trunc('month',r.day)
 ), months as (
  select generate_series(date '2026-11-01',least(cutoff,(now() at time zone 'Asia/Riyadh')::date),interval '1 month')::date period
 ), coffee_limits as (
  select m.period,case when m.period=date '2026-11-01' then date '2026-11-08' else m.period+((7-extract(dow from m.period)::integer)%7) end ending from months m
 ), coffee_counts as (
  select e.branch,c.period,c.ending,count(*) total
  from coffee_limits c join eligible e
   on e.occurred_at>=(c.ending-3)::timestamp at time zone 'Asia/Riyadh'
   and e.occurred_at<c.ending::timestamp at time zone 'Asia/Riyadh'
  where c.ending<=cutoff and c.ending<=(now() at time zone 'Asia/Riyadh')::date
  group by e.branch,c.period,c.ending
 ), ranked as (
  select c.*,dense_rank() over(partition by c.period order by c.total desc) position from coffee_counts c
 ), winners as (
  select min(r.branch) branch,'coffee'::text badge,r.period,r.ending::timestamp at time zone 'Asia/Riyadh' approved_at
  from ranked r where r.position=1 group by r.period,r.ending having count(*)=1
 )
 select b.branch,b.badge,b.period,b.approved_at from private.branch_badge_rewards b where b.badge in ('milestone','milestone500')
 union all select * from rocket
 union all select * from winners;
$$;
revoke all on function private.earned_branch_badges(date) from public,anon,authenticated;

create or replace function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 legacy jsonb:=private.graded_review_progression(profile,cutoff);
 start_month constant date:=date '2026-12-01';
 period date; peak numeric;
 sea_count integer; branch_count integer; branch_stars integer; coins numeric; stars numeric; highest numeric:=0;
begin
 coins:=(legacy->>'coins')::numeric;
 stars:=(legacy->>'stars')::numeric;
 -- Use the same Riyadh opening-to-opening window as the sea campaign.
 select count(*) into sea_count from public.sea_mission_completions c
 cross join lateral (
   select make_date(2026,11,c.day) as day, make_date(2026,11,c.day)+1 as tomorrow
 ) d
 cross join lateral (
   select case when c.branch in ('جاليري','القصر') then 14 when c.branch='ذافيو' then 12
     when c.branch in ('المملكة','سلام') then 10 else 7 end opening
 ) h
 where d.day<=cutoff and c.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 and exists (
   select 1 from public.reviews r
   where profile=any(r.employee_ids) and r.rating>=4
   and case r.branch when 'الرياض جاليري' then 'جاليري' when 'القصر مول' then 'القصر' when 'شرق بلازا' then 'شرق' else r.branch end=c.branch
   and r.occurred_at>=((d.day+make_time(case when extract(dow from d.day)=5 then 14 else h.opening end,0,0)) at time zone 'Asia/Riyadh')
   and r.occurred_at<((d.tomorrow+make_time(case when extract(dow from d.tomorrow)=5 then 14 else h.opening end,0,0)) at time zone 'Asia/Riyadh')
   and r.occurred_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 );
 coins:=coins+sea_count*3;
 stars:=stars+sea_count*5;
 select coalesce(sum(case b.badge when 'milestone' then 10000 when 'milestone500' then 1000 else 25 end),0),
 count(*) filter(where b.badge not in ('milestone','milestone500'))*20
 into branch_count,branch_stars
 from private.earned_branch_badges(cutoff) b
 where b.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 and case when b.badge in ('milestone','milestone500') then exists (
   select 1 from private.branch_badge_reward_recipients recipient
   where recipient.branch=b.branch and recipient.badge=b.badge and recipient.period=b.period
   and recipient.profile_id=profile and recipient.approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
 ) else 5<=(
   select count(*) from public.reviews r
   where r.branch=b.branch and r.rating>=4 and profile=any(r.employee_ids)
   and r.occurred_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at>=b.period::timestamp at time zone 'Asia/Riyadh'
   and r.occurred_at<(b.period+interval '1 month') at time zone 'Asia/Riyadh'
 ) end;
 coins:=coins+branch_count;
 stars:=stars+branch_stars;

 for period in
   select distinct date_trunc('month',r.occurred_at at time zone 'Asia/Riyadh')::date
   from public.reviews r where profile=any(r.employee_ids) and r.rating>=4
   and (r.occurred_at at time zone 'Asia/Riyadh')::date between start_month and cutoff
 loop
   peak:=private.monthly_peak_score(profile,period,least((period+interval '1 month')::date,cutoff+1));
   highest:=greatest(highest,peak);
   -- Rating and mission rewards are already included in graded_review_progression.
   coins:=coins+(case when peak>=8 then 30 else 0 end)+(case when peak>=11 then 50 else 0 end);
   stars:=stars+(case when peak>=8 then 25 else 0 end)+(case when peak>=11 then 40 else 0 end);
 end loop;
 return jsonb_build_object('coins',coins,'stars',stars,'highestTier',case when highest>=11 then 'gold' when highest>=8 then 'silver' else 'bronze' end);
end $$;

create or replace function public.get_read_model() returns jsonb
language sql stable security definer set search_path='' as $$
 select private.read_model_before_branch_badge_rewards() || jsonb_build_object('branchBadgeRewards',(
   select coalesce(jsonb_agg(jsonb_build_object('branch',branch,'badge',badge,'period',period) order by branch,badge,period),'[]')
   from private.earned_branch_badges((now() at time zone 'Asia/Riyadh')::date)
 ));
$$;
revoke all on function public.get_read_model() from public,anon;
grant execute on function public.get_read_model() to authenticated;

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

insert into public.avatar_variants(collection_id,name,image_path,abaya_grade)
select a.id,
 s.variant_names[v.position],
 'bundled/'||case s.shoe_number when 1 then 'saudi-abaya-lv-olympia-gold-v1' when 2 then 'saudi-abaya-nike-vomero-v1' else 'saudi-dark-v1' end
 ||'/avatar-'||lpad(s.shoe_number::text,2,'0')||'-'||v.suffix||case when s.shoe_number=1 then '.png' else '.webp' end,
 substring(s.grades from v.position::integer for 1)::smallint
from public.avatar_collections a join avatar_shoe_prices s on s.name=a.name
cross join unnest(array['a','b','c','d','e','f']) with ordinality v(suffix,position)
on conflict do nothing;

-- Publish existing catalogue without changing ownership or purchase records.
update public.avatar_collections set enabled=true where price=round(price) and
 (case when lower(trim(name))='lv olympia' then price=9500 else price between 349 and 1999 end);
update public.avatar_variants set enabled=true;
update public.employee_feature_settings set data=data||'{"avatars":true}'::jsonb where id=1;
commit;
