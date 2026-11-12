begin;
insert into public.branches(id,data)
values ('economy-test','{"id":"economy-test","name":"Economy","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name',id,'branch','economy-test','role',role)
from (values ('economy-admin','admin'),('economy-owner','employee'),('economy-partner','employee')) a(id,role);
insert into auth.users(id,email) values
 ('50000000-0000-4000-8000-000000000001','economy-admin@example.invalid'),
 ('50000000-0000-4000-8000-000000000002','economy-owner@example.invalid'),
 ('50000000-0000-4000-8000-000000000003','economy-partner@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('50000000-0000-4000-8000-000000000001','economy-admin','admin',null),
 ('50000000-0000-4000-8000-000000000002','economy-owner','employee','economy-test'),
 ('50000000-0000-4000-8000-000000000003','economy-partner','employee','economy-test');
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.reviews(id,data)
select 'economy-dec-'||n,jsonb_build_object('id','economy-dec-'||n,'branch','economy-test',
 'rating','5','date',to_char(date '2026-12-01'+((n-1)%8),'DD-MM-YYYY'),'time','12:00',
 'linkedEmployeeIds',jsonb_build_array('economy-owner','economy-partner'))
from generate_series(1,20) n;
do $$ declare earned jsonb; begin
 earned:=private.employee_progression('economy-owner','2026-12-31');
 if (earned->>'coins')::numeric<>444.38 or (earned->>'stars')::numeric<>513.44 or earned->>'highestTier'<>'silver' then
   raise exception 'Monthly rewards mismatch: %',earned;
 end if;
 if (private.employee_progression('economy-owner','2026-11-30')->>'coins')::numeric<>0 then raise exception 'Future month paid early'; end if;
 if (select min(c.price+50*v.abaya_grade) from public.avatar_collections c join public.avatar_variants v on c.id=v.collection_id)<>349
 or (select max(c.price+50*v.abaya_grade) from public.avatar_collections c join public.avatar_variants v on c.id=v.collection_id where c.name<>'LV Olympia')<>2199
 or (select c.price+50*v.abaya_grade+499 from public.avatar_collections c join public.avatar_variants v on c.id=v.collection_id where c.name='LV Olympia' and v.name='أفق')<>10199 then
   raise exception 'Catalog limits mismatch';
 end if;
end $$;
insert into private.branch_badge_rewards(branch,badge,period,approved_at)
values ('economy-test','coffee','2026-12-01','2026-12-06T09:00:00+03:00');
do $$ begin
 if (private.employee_progression('economy-owner','2026-12-31')->>'coins')::numeric<>469.38
 then raise exception 'Approved branch badge reward missing'; end if;
end $$;
insert into public.branches(id,data)
values ('جاليري','{"id":"جاليري","name":"جاليري","start":"14:00","end":"23:00","nextDayTime":"14:00"}')
on conflict do nothing;
update public.profiles set data=data||'{"isCoverage":true}' where id='economy-owner';
insert into public.timeline_events(id,data) values ('economy-sea-shift','{"id":"economy-sea-shift","branch":"جاليري","type":"shift","title":"شفت","date":"07-11-2026","time":"14:00","endTime":"23:00","employees":[{"id":"economy-owner","name":"economy-owner"}]}');
insert into public.reviews(id,data) values
 ('economy-sea-1','{"id":"economy-sea-1","branch":"جاليري","rating":"5","date":"07-11-2026","time":"16:00","linkedEmployeeIds":["economy-owner"]}'),
 ('economy-sea-2','{"id":"economy-sea-2","branch":"جاليري","rating":"5","date":"07-11-2026","time":"17:00","linkedEmployeeIds":["economy-owner"]}');
do $$ begin
 if (private.employee_progression('economy-owner','2026-11-07')->>'coins')::numeric<>25
 then raise exception 'Automatic sea reward missing'; end if;
end $$;
insert into public.sea_mission_completions(branch,day,approved_at,approved_by)
values ('جاليري',7,'2026-11-07T18:00:00+03:00','50000000-0000-4000-8000-000000000001');
do $$ begin
 if (private.employee_progression('economy-owner','2026-11-07')->>'coins')::numeric<>25
 then raise exception 'Sea reward not credited exactly once'; end if;
end $$;
update public.employee_feature_settings set data=data||'{"avatars":true,"tiers":true}' where id=1;
-- Fund an existing owner's upgrade using historical review earnings.
insert into public.reviews(id,data)
select 'economy-funding-'||n,jsonb_build_object('id','economy-funding-'||n,'branch','economy-test','rating','5',
 'date','01-10-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('economy-owner'))
from generate_series(1,2050) n;
select set_config('economy.variant',(select v.id::text from public.avatar_variants v
 join public.avatar_collections c on c.id=v.collection_id where c.name='Nike Revolution' and v.abaya_grade=0 limit 1),true);
insert into public.avatar_purchases(variant_id,profile_id,price_paid)
values (current_setting('economy.variant')::uuid,'economy-owner',699);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.purchase_gold_avatar(current_setting('economy.variant')::uuid,9500); raise exception 'Nonowner purchased upgrade'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.purchase_gold_avatar(current_setting('economy.variant')::uuid,9500);
do $$ begin
 if (public.get_avatar_store()#>>'{wallet,spent}')::numeric<>10199 then raise exception 'Incorrect total upgrade cost'; end if;
 begin perform public.purchase_gold_avatar(current_setting('economy.variant')::uuid,9500); raise exception 'Duplicate upgrade accepted'; exception when unique_violation then null; end;
 begin perform public.fulfill_gold_avatar(current_setting('economy.variant')::uuid,'50000000-0000-4000-8000-000000000009.webp'); raise exception 'Employee delivered upgrade'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name,metadata)
values ('avatar-store','50000000-0000-4000-8000-000000000009.webp','{"mimetype":"image/webp"}');
select public.fulfill_gold_avatar(current_setting('economy.variant')::uuid,'50000000-0000-4000-8000-000000000009.webp');
reset role;
-- Use a fulfillment time before the transaction-stable current timestamp.
update private.gold_avatar_upgrades set fulfilled_at=now()-interval '1 minute'
where variant_id=current_setting('economy.variant')::uuid;
insert into public.avatar_equipped(profile_id,variant_id)
values ('economy-owner',current_setting('economy.variant')::uuid);
do $$ begin
 if public.get_avatar_store()#>>'{equipped,economy-owner}' not like 'bundled/%' then
   raise exception 'Gold art was exposed below the monthly threshold';
 end if;
end $$;
insert into public.reviews(id,data)
select 'economy-plus-'||kind,jsonb_build_object('id','economy-plus-'||kind,'branch','economy-test',
 'rating','5','date',to_char(at_time at time zone 'Asia/Riyadh','DD-MM-YYYY'),
 'time',to_char(at_time at time zone 'Asia/Riyadh','HH24:MI'),
 'linkedEmployeeIds',jsonb_build_array('economy-owner','economy-partner'))
from (values ('before',now()-interval '1 hour'),('locked',now()+interval '1 minute')) a(kind,at_time);
insert into public.reviews(id,data)
select 'economy-unlock-'||n,jsonb_build_object('id','economy-unlock-'||n,'branch','economy-test',
 'rating','5','date',to_char((now() at time zone 'Asia/Riyadh')::date,'DD-MM-YYYY'),'time','00:00',
 'linkedEmployeeIds',jsonb_build_array('economy-owner'))
from generate_series(1,20) n;
insert into public.reviews(id,data)
select 'economy-plus-'||kind,jsonb_build_object('id','economy-plus-'||kind,'branch','economy-test',
 'rating','5','date',to_char(at_time,'DD-MM-YYYY'),
 'time',to_char(at_time,'HH24:MI'),'linkedEmployeeIds',jsonb_build_array('economy-owner','economy-partner'))
from (values ('after',(now()+interval '1 minute') at time zone 'Asia/Riyadh'),
 ('next-month',date_trunc('month',now() at time zone 'Asia/Riyadh')+interval '1 month 1 minute')) a(kind,at_time);
do $$ begin
 if public.get_avatar_store()#>>'{equipped,economy-owner}' is distinct from '50000000-0000-4000-8000-000000000009.webp' then
   raise exception 'Gold art did not activate at the monthly threshold';
 end if;
 if exists (select 1 from public.reviews where id in ('economy-plus-before','economy-plus-locked','economy-plus-next-month') and gold_plus)
 or not (select gold_plus from public.reviews where id='economy-plus-after') then
   raise exception 'Plus did not respect fulfillment or monthly balance';
 end if;
end $$;
-- The six premium Nike variants already include the feature.
insert into public.reviews(id,data)
select 'economy-nike-funds-'||n,jsonb_build_object('id','economy-nike-funds-'||n,'branch','economy-test','rating','5',
 'date','02-10-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('economy-partner'))
from generate_series(1,2200) n;
update public.profiles set data=data||'{"manualStats":{"positive":5}}' where id='economy-partner';
select set_config('economy.nike',(select v.id::text from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id
 where c.name='LV Olympia' and v.name='أفق'),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
-- Collect synthetic funding through the same employee endpoint as the UI.
do $$ declare item jsonb; begin
 for item in select value from jsonb_array_elements(public.get_avatar_store()#>'{wallet,pendingAchievements}') loop
  perform public.collect_coin_achievement(item->>'id');
 end loop;
end $$;
select public.purchase_avatar(current_setting('economy.nike')::uuid,10199);
reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.avatar_purchases set purchased_at=now()-interval '1 minute' where variant_id=current_setting('economy.nike')::uuid;
do $$ begin
 if not (select included_gold_burqa from public.avatar_purchases where variant_id=current_setting('economy.nike')::uuid) then
   raise exception 'Nike purchase lost included burqa';
 end if;
 if exists(select 1 from private.gold_avatar_upgrades where variant_id=current_setting('economy.nike')::uuid)
 then raise exception 'Bundled Nike created a design request'; end if;
 if public.get_avatar_store()#>>'{equipped,economy-partner}' not like '%saudi-abaya-lv-olympia-v1%' then
   raise exception 'Bundled Nike gold shown below threshold'; end if;
end $$;
insert into public.reviews(id,data)
select 'economy-nike-month-'||n,jsonb_build_object('id','economy-nike-month-'||n,'branch','economy-test','rating','5',
 'date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','00:00',
 'linkedEmployeeIds',jsonb_build_array('economy-partner'))
from generate_series(1,20) n;
insert into public.reviews(id,data)
select 'economy-nike-plus',jsonb_build_object('id','economy-nike-plus','branch','economy-test','rating','5',
 'date',to_char((now()+interval '2 minutes') at time zone 'Asia/Riyadh','DD-MM-YYYY'),
 'time',to_char((now()+interval '2 minutes') at time zone 'Asia/Riyadh','HH24:MI'),
 'linkedEmployeeIds',jsonb_build_array('economy-partner'));
do $$ begin
 if public.get_avatar_store()#>>'{equipped,economy-partner}' not like '%saudi-abaya-lv-olympia-gold-v1%' then
   raise exception 'Bundled Nike burqa not activated at threshold'; end if;
 if not (select gold_plus from public.reviews where id='economy-nike-plus') then
   raise exception 'Bundled Nike did not inherit Plus'; end if;
end $$;
rollback;
