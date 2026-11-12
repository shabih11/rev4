begin;
-- Synthetic accounts only. This file is run by the isolated CI database runner.
insert into public.branches(id,data) values
 ('privilege-test',jsonb_build_object('id','privilege-test','name','privilege-test','start','07:00','end','23:00','nextDayTime','07:00')),
 ('privilege-other',jsonb_build_object('id','privilege-other','name','privilege-other','start','07:00','end','23:00','nextDayTime','07:00'));
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name',id,'role',role,'branch',branch,'manualStats',jsonb_build_object('positive',positive,'monthReviews',balance))
from (values ('priv-admin','admin','privilege-test',0::numeric,0),('priv-gold','employee','privilege-test',5,20),
 ('priv-normal','employee','privilege-test',5,20),('priv-partner','employee','privilege-test',5,20),
 ('priv-18','employee','privilege-test',4.5,18),('priv-outsider','employee','privilege-other',4.5,18)) p(id,role,branch,positive,balance);
insert into auth.users(id,email) select ('71000000-0000-4000-8000-00000000000'||n)::uuid,'privilege-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.user_access(uid,profile_id,role,branch)
select ('71000000-0000-4000-8000-00000000000'||n)::uuid,id,role,case when role='admin' then null else branch end
from (values (1,'priv-admin','admin','privilege-test'),(2,'priv-gold','employee','privilege-test'),(3,'priv-normal','employee','privilege-test'),
 (4,'priv-partner','employee','privilege-test'),(5,'priv-18','employee','privilege-test'),(6,'priv-outsider','employee','privilege-other')) p(n,id,role,branch);
update public.employee_feature_settings set data=data||'{"avatars":true,"rounding":true}' where id=1;
insert into public.avatar_collections(id,name,price,enabled) values ('71000000-0000-4000-8000-000000000010','Privilege test',100,true);
insert into public.avatar_variants(id,collection_id,name,image_path)
select ('71000000-0000-4000-8000-0000000000'||n)::uuid,'71000000-0000-4000-8000-000000000010','Style '||n,'71000000-0000-4000-8000-0000000000'||n||'.webp' from generate_series(11,14) n;
insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa,purchased_at) values
 ('71000000-0000-4000-8000-000000000011','priv-gold',0,true,(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month'+interval '1 day') at time zone 'Asia/Riyadh'),
 ('71000000-0000-4000-8000-000000000012','priv-normal',0,false,(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month'+interval '1 day') at time zone 'Asia/Riyadh');
insert into public.reviews(id,data) values ('priv-negative',jsonb_build_object('id','priv-negative','branch','privilege-test','rating','1',
 'date',to_char(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month'+interval '2 days','DD-MM-YYYY'),'time','10:00','linkedEmployeeIds',jsonb_build_array('priv-normal','priv-partner')));
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; begin
 begin perform public.equip_avatar('71000000-0000-4000-8000-000000000011'); raise exception 'Old ownership bypassed activation'; exception when insufficient_privilege then null; end;
 begin perform public.use_avatar_privilege(month,'complete','priv-outsider'); raise exception 'Cross branch rescue'; exception when insufficient_privilege then null; end;
 begin perform public.close_reward_month(month); raise exception 'Employee closed rewards'; exception when insufficient_privilege then null; end;
 perform public.use_avatar_privilege(month,'erase','priv-negative');
 perform public.use_avatar_privilege(month,'complete','priv-18');
 begin perform public.use_avatar_privilege(month,'erase','priv-negative'); raise exception 'Double monthly erase'; exception when unique_violation then null; end;
 begin perform public.use_avatar_privilege(month,'complete','priv-partner'); raise exception 'Double monthly completion'; exception when unique_violation or invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; score numeric; begin
 select points into score from private.avatar_month_scores(month,date_trunc('month',now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh') where profile_id='priv-partner';
 if score<>11 then raise exception 'Gold did not restore all negative partners'; end if;
 select points into score from private.avatar_month_scores(month,date_trunc('month',now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh') where profile_id='priv-18';
 if score<>11 then raise exception '18 shares did not complete gold'; end if;
 if (select count(*) from public.reviews where 'priv-18'=any(employee_ids))<>0 then raise exception 'Completion manufactured reviews'; end if;
 if not exists(select 1 from public.reviews where id='priv-negative') then raise exception 'Waiver deleted original'; end if;
 if (select count(*) from private.avatar_privilege_uses where actor='priv-gold')<>2 then raise exception 'Actions did not have independent quotas'; end if;
end $$;
-- Ordinary avatars waive only the owner's share, even on a shared negative.
insert into public.reviews(id,data) values ('priv-negative-own',jsonb_build_object('id','priv-negative-own','branch','privilege-test','rating','1',
 'date',to_char(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month'+interval '3 days','DD-MM-YYYY'),'time','10:00','linkedEmployeeIds',jsonb_build_array('priv-normal','priv-partner')));
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; begin
 perform public.use_avatar_privilege(month,'erase','priv-negative-own');
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; score numeric; begin
 select points into score from private.avatar_month_scores(month,date_trunc('month',now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh') where profile_id='priv-partner';
 if score<>10.75 then raise exception 'Ordinary waiver leaked to partner'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
-- Renewal unlocks old owned art while preserving exclusive ownership.
insert into public.avatar_purchases(variant_id,profile_id,price_paid,included_gold_burqa,purchased_at) values
 ('71000000-0000-4000-8000-000000000013','priv-gold',0,false,date_trunc('day',now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh');
set local role authenticated;
select public.equip_avatar('71000000-0000-4000-8000-000000000011');
do $$ begin
 if (public.get_avatar_store()->>'monthActive')::boolean is distinct from true then raise exception 'Renewal did not unlock selection'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
-- A gold owner with a current purchase shares the 16-riyal review even with an ineligible colleague.
insert into public.reviews(id,data) values ('priv-positive',jsonb_build_object('id','priv-positive','branch','privilege-test','rating','5',
 'date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time',to_char(now() at time zone 'Asia/Riyadh','HH24:MI'),'linkedEmployeeIds',jsonb_build_array('priv-gold','priv-18')));
do $$ begin
 if not coalesce((select avatar_reward_employee_ids @> array['priv-gold','priv-18'] and cardinality(avatar_reward_employee_ids)=2 from public.reviews where id='priv-positive'),false) then raise exception 'Gold share missing'; end if;
end $$;
-- The sea extra return is shared by all gold owners in a branch, not per owner.
insert into private.avatar_sea_returns(branch,day,actor) values ('جاليري',6,'priv-gold');
do $$ begin
 begin insert into private.avatar_sea_returns(branch,day,actor) values ('جاليري',7,'priv-normal'); raise exception 'Second branch return allowed'; exception when unique_violation then null; end;
 if has_function_privilege('anon','public.use_avatar_sea_return()','EXECUTE') then raise exception 'Anonymous sea rescue allowed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; begin
 perform public.close_reward_month(month);
 begin perform public.close_reward_month(month); raise exception 'Closure overwritten'; exception when unique_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare month date:=(date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date; begin
 begin perform public.use_avatar_privilege(month,'complete','priv-normal'); raise exception 'Closed month rescue'; exception when insufficient_privilege then null; end;
 begin delete from public.reviews where id='priv-negative'; if found then raise exception 'Direct employee deletion'; end if; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin update public.reviews set data=data||'{"comment":"changed"}' where id='priv-negative'; raise exception 'Closed review changed'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','private.avatar_privilege_uses','INSERT') then raise exception 'Actions directly writable'; end if;
 if has_function_privilege('anon','public.use_avatar_privilege(date,text,text)','EXECUTE') then raise exception 'Anonymous action allowed'; end if;
 if has_function_privilege('authenticated','public.equip_avatar_before_month_activation(uuid)','EXECUTE') then raise exception 'Old equip bypass exposed'; end if;
 if has_function_privilege('anon','public.close_reward_month(date)','EXECUTE') then raise exception 'Anonymous closure allowed'; end if;
end $$;
rollback;
