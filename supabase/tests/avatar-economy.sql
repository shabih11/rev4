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
 if (earned->>'coins')::numeric<>797.25 or (earned->>'stars')::numeric<>846.25 or earned->>'highestTier'<>'silver' then
   raise exception 'Monthly rewards mismatch: %',earned;
 end if;
 if (private.employee_progression('economy-owner','2026-11-30')->>'coins')::numeric<>0 then raise exception 'Future month paid early'; end if;
 if exists(select 1 from public.avatar_collections c join public.avatar_variants v on c.id=v.collection_id where private.avatar_sale_price(c,v)<0 or (lower(c.name)='lv olympia' and private.avatar_sale_price(c,v)>0 and private.avatar_sale_price(c,v)<12499)) then raise exception 'Catalog limits mismatch'; end if;
end $$;
insert into private.branch_badge_rewards(branch,badge,period,approved_at)
values ('economy-test','coffee','2026-12-01','2026-12-06T09:00:00+03:00');
do $$ begin
 if (private.employee_progression('economy-owner','2026-12-31')->>'coins')::numeric<>797.25
 then raise exception 'Manual coffee flag bypassed derived winner'; end if;
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
 if (private.employee_progression('economy-owner','2026-11-07')->>'coins')::numeric<>40
 then raise exception 'Automatic sea reward missing'; end if;
 if (private.progression_before_rank_challenge('economy-owner','2026-11-07')->>'stars')::numeric
   -(private.graded_review_progression('economy-owner','2026-11-07')->>'stars')::numeric<>20
 then raise exception 'Daily sea stars must equal 20'; end if;
 if (select coins from private.coin_achievements_before_rank('economy-owner') where id='sea') is distinct from 25::numeric
 then raise exception 'Daily sea collectible coins must equal 25'; end if;
end $$;
insert into public.sea_mission_completions(branch,day,approved_at,approved_by)
values ('جاليري',7,'2026-11-07T18:00:00+03:00','50000000-0000-4000-8000-000000000001');
do $$ begin
 if (private.employee_progression('economy-owner','2026-11-07')->>'coins')::numeric<>40
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
do $$ begin
 begin perform public.purchase_gold_avatar(current_setting('economy.variant')::uuid,9500); raise exception 'Standalone gold upgrade accepted'; exception when insufficient_privilege then null; end;
 if (public.get_avatar_store()#>>'{wallet,spent}')::numeric<>699 then raise exception 'Rejected upgrade charged wallet'; end if;
 begin perform public.fulfill_gold_avatar(current_setting('economy.variant')::uuid,'50000000-0000-4000-8000-000000000009.webp'); raise exception 'Employee delivered upgrade'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
