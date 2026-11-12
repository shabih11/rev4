begin;
insert into public.branches(id,data) values ('avatar-privileges-test','{"id":"avatar-privileges-test","name":"Avatar test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name',id,'branch','avatar-privileges-test','role',role,'manualStats',jsonb_build_object('monthReviews',20))
from (values ('avatar-admin','admin'),('avatar-gold','employee'),('avatar-normal','employee'),('avatar-partner','employee')) a(id,role);
insert into auth.users(id,email) select ('60000000-0000-4000-8000-00000000000'||n)::uuid,'avatar-test-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.user_access(uid,profile_id,role,branch)
select ('60000000-0000-4000-8000-00000000000'||n)::uuid,id,role,case when role='admin' then null else 'avatar-privileges-test' end
from (values (1,'avatar-admin','admin'),(2,'avatar-gold','employee'),(3,'avatar-normal','employee'),(4,'avatar-partner','employee')) a(n,id,role);
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.employee_feature_settings set data=data||'{"avatars":true}'::jsonb where id=1;
insert into public.avatar_collections(id,name,price,enabled) values ('60000000-0000-4000-8000-000000000010','Test shoes',1400,true);
insert into public.avatar_variants(id,collection_id,name,image_path,abaya_grade) select
 ('60000000-0000-4000-8000-0000000000'||n)::uuid,'60000000-0000-4000-8000-000000000010','Test style '||n,
 ('60000000-0000-4000-8000-0000000000'||n)||'.webp',0 from generate_series(11,15) n;
insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa,purchased_at) values
 ('60000000-0000-4000-8000-000000000011','avatar-gold',0,true,now()-interval '1 month'),
 ('60000000-0000-4000-8000-000000000012','avatar-normal',0,false,now()-interval '1 minute');
-- Earn sufficient currency without depending on a production account or changing money rules.
insert into public.reviews(id,data) select 'avatar-fund-'||n,jsonb_build_object('id','avatar-fund-'||n,'branch','avatar-privileges-test','rating','5',
 'date',to_char(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 day','DD-MM-YYYY'),'time','10:00','linkedEmployeeIds',jsonb_build_array('avatar-gold')) from generate_series(1,400) n;
do $$ begin
 if not private.has_gold_avatar_privilege('avatar-gold',now()+interval '2 months') then raise exception 'Permanent privilege expired'; end if;
 if private.has_gold_avatar_privilege('avatar-normal') then raise exception 'Ordinary purchase granted gold'; end if;
 if private.avatar_review_eligible('avatar-gold',now(),null) then raise exception 'Previous-month purchase granted ordinary monthly benefit'; end if;
 if not private.avatar_review_eligible('avatar-normal',now(),null) then raise exception 'Monthly ordinary benefit missing'; end if;
 if private.avatar_review_eligible('avatar-normal',(date_trunc('month',now() at time zone 'Asia/Riyadh')+interval '1 month') at time zone 'Asia/Riyadh',null) then raise exception 'Monthly benefit did not expire'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
-- Collect synthetic funding through the same employee endpoint as the UI.
do $$ declare item jsonb; begin
 for item in select value from jsonb_array_elements(public.get_avatar_store()#>'{wallet,pendingAchievements}')
 where value->>'id' not like 'tier:%' and value->>'id' not like 'rank:%' loop
  perform public.collect_coin_achievement(item->>'id');
 end loop;
end $$;
select public.purchase_avatar('60000000-0000-4000-8000-000000000013',1400);
do $$ begin
 begin perform public.purchase_avatar('60000000-0000-4000-8000-000000000013',1400); raise exception 'Double sale'; exception when unique_violation then null; end;
 begin perform public.purchase_gold_avatar('60000000-0000-4000-8000-000000000013',9500); raise exception 'Standalone gold purchase'; exception when insufficient_privilege then null; end;
 begin perform public.adjust_avatar_price('60000000-0000-4000-8000-000000000010',null,50,1400); raise exception 'Employee changed price'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.gold_avatar_upgrades where variant_id='60000000-0000-4000-8000-000000000013' and price_paid=0 and fulfilled_at is null) then raise exception 'Automatic free conversion request missing'; end if;
 if (select count(*) from private.gold_avatar_upgrades where variant_id='60000000-0000-4000-8000-000000000013')<>1 then raise exception 'Duplicate conversion'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.adjust_avatar_price('60000000-0000-4000-8000-000000000010',null,50,1400);
select public.adjust_avatar_price('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000014',50,1450);
select public.adjust_avatar_price('60000000-0000-4000-8000-000000000010',null,-50,1450);
select public.set_avatar_variant_enabled('60000000-0000-4000-8000-000000000015',false);
do $$ begin
 begin perform public.adjust_avatar_price('60000000-0000-4000-8000-000000000010',null,25,1400); raise exception 'Wrong price step'; exception when invalid_parameter_value then null; end;
 begin perform public.adjust_avatar_price('60000000-0000-4000-8000-000000000010',null,50,1450); raise exception 'Stale price accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
do $$ begin
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='60000000-0000-4000-8000-000000000014')<>1450 then raise exception 'Individual adjustment lost on shoe change'; end if;
 if (select private.avatar_sale_price(c,v) from public.avatar_variants v join public.avatar_collections c on c.id=v.collection_id where v.id='60000000-0000-4000-8000-000000000013')<>1400 then raise exception 'Individual adjustment leaked'; end if;
end $$;
insert into public.reviews(id,data) values ('avatar-shared',jsonb_build_object('id','avatar-shared','branch','avatar-privileges-test','rating','5',
 'date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time',to_char(now() at time zone 'Asia/Riyadh','HH24:MI'),'linkedEmployeeIds',jsonb_build_array('avatar-normal','avatar-partner')));
do $$ begin
 if (select avatar_reward_employee_ids from public.reviews where id='avatar-shared') is distinct from array['avatar-normal'] then raise exception 'Shared review eligibility leaked'; end if;
end $$;
-- Text-only edits preserve the recorded entitlement.
update public.reviews set data=data||'{"comment":"edited"}' where id='avatar-shared';
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare payload jsonb; begin
 payload:=public.get_avatar_store();
 if exists(select 1 from jsonb_array_elements(payload->'collections') c cross join jsonb_array_elements(c->'variants') v where v->>'id'='60000000-0000-4000-8000-000000000015') then raise exception 'Hidden unowned model visible'; end if;
 if payload->>'goldEntitled'<>'false' then raise exception 'Incorrect gold privilege'; end if;
 if not exists(select 1 from jsonb_array_elements(public.get_read_model()->'reviews') r where r->>'id'='avatar-shared' and r->'avatarRewardEmployeeIds'='["avatar-normal"]') then raise exception 'Reward recipients missing from read model'; end if;
end $$;
reset role;
rollback;
