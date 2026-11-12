begin;
insert into public.branches(id,data) values ('tier-test','{"id":"tier-test","name":"tier-test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('tier-silver','{"id":"tier-silver","name":"Tier silver","role":"employee","branch":"tier-test"}'),
 ('tier-jump','{"id":"tier-jump","name":"Tier jump","role":"employee","branch":"tier-test","manualStats":{"positive":5}}');
insert into auth.users(id,email) values
 ('74000000-0000-4000-8000-000000000001','tier-silver@example.invalid'),
 ('74000000-0000-4000-8000-000000000002','tier-jump@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('74000000-0000-4000-8000-000000000001','tier-silver','employee','tier-test'),
 ('74000000-0000-4000-8000-000000000002','tier-jump','employee','tier-test');
do $$ begin
 if exists(select 1 from private.tier_achievements('tier-silver','2026-11-04T12:00:00+03')) then raise exception 'Bronze earned tier reward'; end if;
end $$;
insert into public.reviews(id,data)
select 'tier-positive-'||n,jsonb_build_object('id','tier-positive-'||n,'branch','tier-test','rating','5',
 'date','05-11-2026','time','10:00','linkedEmployeeIds',jsonb_build_array('tier-silver')) from generate_series(1,8) n;
insert into public.reviews(id,data) values ('tier-jump-review',jsonb_build_object('id','tier-jump-review','branch','tier-test','rating','5',
 'date','05-11-2026','time','11:00','linkedEmployeeIds',jsonb_build_array('tier-jump')));
do $$ declare reward record; base jsonb; actual jsonb; begin
 select * into reward from private.tier_achievements('tier-silver','2026-11-05T12:00:00+03');
 if reward.tier is distinct from 'silver' or reward.coins<>100 or reward.stars<>100 then raise exception 'Silver amount incorrect'; end if;
 if (select count(*) from private.tier_achievements('tier-jump','2026-11-05T12:00:00+03'))<>2
 or (select sum(coins) from private.tier_achievements('tier-jump','2026-11-05T12:00:00+03'))<>350
 or (select sum(stars) from private.tier_achievements('tier-jump','2026-11-05T12:00:00+03'))<>350 then raise exception 'Direct gold jump did not earn both independent tiers'; end if;
 base:=private.progression_before_tier_missions('tier-silver','2026-11-05'); actual:=private.employee_progression('tier-silver','2026-11-05');
 if (actual->>'coins')::numeric-(base->>'coins')::numeric<>100 or (actual->>'stars')::numeric-(base->>'stars')::numeric<>100 then raise exception 'Tier progression not credited'; end if;
 if (select sum(coins) from private.coin_achievements('tier-silver'))<>(private.employee_progression('tier-silver')->>'coins')::numeric then raise exception 'Tier collector double counted rewards'; end if;
end $$;
-- A later negative lowers the current score, but not the already reached peak.
insert into public.reviews(id,data) values ('tier-negative',jsonb_build_object('id','tier-negative','branch','tier-test','rating','1',
 'date','06-11-2026','time','10:00','linkedEmployeeIds',jsonb_build_array('tier-silver')));
do $$ begin
 if private.tier_peak_points('tier-silver','2026-11-01','2026-11-06T12:00:00+03')<>8 then raise exception 'Reached peak was lost'; end if;
 if (select count(*) from private.tier_achievements('tier-silver','2026-11-06T12:00:00+03'))<>1 then raise exception 'Silver duplicated or lost after drop'; end if;
 if (select count(*) from private.tier_achievements('tier-jump','2026-12-15T12:00:00+03') where period='2026-12')<>2 then raise exception 'New month did not create independent tier missions'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"74000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare first jsonb; again jsonb; begin
 first:=public.collect_coin_achievement('tier:2026-11:silver'); again:=public.collect_coin_achievement('tier:2026-11:silver');
 if (first->>'available')::numeric<>100 or first<>again then raise exception 'Silver retry paid twice'; end if;
 if not exists(select 1 from jsonb_array_elements(first->'tierMissions') m where m->>'tier'='silver' and (m->>'completed')::boolean and (m->>'collected')::boolean) then raise exception 'Collected achievement status missing'; end if;
 begin perform public.collect_coin_achievement('tier:2026-11:gold'); raise exception 'Unreached gold collected'; exception when invalid_parameter_value then null; end;
 begin perform private.employee_tier_missions('tier-jump'); raise exception 'Another employee tiers exposed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"74000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare wallet jsonb; begin
 wallet:=public.collect_coin_achievement('tier:2026-11:gold');
 if (wallet->>'available')::numeric<>250 then raise exception 'Gold amount not 250'; end if;
 wallet:=public.collect_coin_achievement('tier:2026-11:silver');
 if (wallet->>'available')::numeric<>350 then raise exception 'Independent silver reward missing'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','private.tier_achievements(text,timestamptz)','execute') then raise exception 'Tier computation exposed'; end if;
 if has_function_privilege('anon','private.avatar_wallet_before_tier_missions(text)','execute') then raise exception 'Wallet bypass exposed'; end if;
end $$;
rollback;
