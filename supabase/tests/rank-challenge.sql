begin;
insert into public.branches(id,data) values
 ('rank-test','{"id":"rank-test","name":"rank-test","start":"07:00","end":"23:00","nextDayTime":"07:00"}'),
 ('rank-target','{"id":"rank-target","name":"rank-target","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) values
 ('rank-worker','{"id":"rank-worker","name":"Rank worker","role":"employee","branch":"rank-test"}'),
 ('rank-admin','{"id":"rank-admin","name":"Rank admin","role":"admin","branch":"rank-test"}');
insert into public.profiles(id,data)
select 'rank-peer-'||n,jsonb_build_object('id','rank-peer-'||n,'name',case when n=2 then 'فاطمة' else 'Rank peer '||n end,
 'role','employee','branch','rank-target','manualStats',jsonb_build_object('monthReviews',case when n=10 then 19 else n end))
from generate_series(1,10) n;
insert into auth.users(id,email) values
 ('73000000-0000-4000-8000-000000000001','rank-worker@example.invalid'),
 ('73000000-0000-4000-8000-000000000002','rank-admin@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values
 ('73000000-0000-4000-8000-000000000001','rank-worker','employee','rank-test'),
 ('73000000-0000-4000-8000-000000000002','rank-admin','admin',null);
insert into public.reviews(id,data)
select 'rank-pre-'||n,jsonb_build_object('id','rank-pre-'||n,'branch','rank-test','rating','5',
 'date','05-11-2026','time',case when n=1 then '10:00' else '11:00' end,'linkedEmployeeIds',jsonb_build_array('rank-worker'))
from generate_series(1,2) n;
do $$ begin
 if (private.rank_challenge('rank-worker','2026-11-10T23:59:59+03')->>'active')::boolean then raise exception 'Opened before either gate'; end if;
 if not (private.rank_challenge('rank-worker','2026-11-11T00:00:00+03')->>'active')::boolean then raise exception 'Day eleven did not open gate'; end if;
 if exists(select 1 from private.rank_achievements('rank-worker','2026-11-10T23:59:59+03')) then raise exception 'Pre-gate ranks awarded'; end if;
end $$;
insert into public.reviews(id,data) values ('rank-after',jsonb_build_object('id','rank-after','branch','rank-test','rating','5',
 'date','11-11-2026','time','10:00','linkedEmployeeIds',jsonb_build_array('rank-worker')));
do $$ declare reward record; begin
 select * into reward from private.rank_achievements('rank-worker','2026-11-11T10:01:00+03');
 if reward.id is distinct from 'rank:2026-11:9' or reward.coins<>99 or reward.stars<>99 then raise exception 'First post-gate reward incorrect'; end if;
end $$;
-- Reviews with the same timestamp are one atomic score change; jumps pay all crossed positions.
insert into public.reviews(id,data)
select 'rank-jump-'||n,jsonb_build_object('id','rank-jump-'||n,'branch','rank-test','rating','5',
 'date','11-11-2026','time','11:00','linkedEmployeeIds',jsonb_build_array('rank-worker')) from generate_series(1,30) n;
do $$ declare total numeric; begin
 select sum(coins) into total from private.rank_achievements('rank-worker','2026-11-11T11:01:00+03');
 if total<>1344.37 then raise exception 'Jump reward mismatch: %',total; end if;
 if (select count(*) from private.rank_achievements('rank-worker','2026-11-11T11:01:00+03'))<>9 then raise exception 'Jump positions missing'; end if;
end $$;
insert into public.reviews(id,data)
select 'rank-drop-'||n,jsonb_build_object('id','rank-drop-'||n,'branch','rank-target','rating','5',
 'date','11-11-2026','time','12:00','linkedEmployeeIds',jsonb_build_array('rank-peer-10')) from generate_series(1,50) n;
insert into public.reviews(id,data)
select 'rank-regain-'||n,jsonb_build_object('id','rank-regain-'||n,'branch','rank-test','rating','5',
 'date','11-11-2026','time','13:00','linkedEmployeeIds',jsonb_build_array('rank-worker')) from generate_series(1,50) n;
do $$ begin
 if (select sum(coins) from private.rank_achievements('rank-worker','2026-11-11T13:01:00+03'))<>1344.37 then raise exception 'Regaining rank paid again'; end if;
end $$;

-- Separate fixture: reaching twenty opens the gate before day eleven.
delete from public.reviews where id like 'rank-%';
insert into public.reviews(id,data) values ('rank-leader-20',jsonb_build_object('id','rank-leader-20','branch','rank-target','rating','5',
 'date','06-11-2026','time','10:00','linkedEmployeeIds',jsonb_build_array('rank-peer-10')));
insert into public.reviews(id,data)
select 'rank-early-'||n,jsonb_build_object('id','rank-early-'||n,'branch','rank-test','rating','5',
 'date','07-11-2026','time',case when n=1 then '10:00' else '11:00' end,'linkedEmployeeIds',jsonb_build_array('rank-worker')) from generate_series(1,2) n;
do $$ declare mission jsonb; total numeric; base jsonb; actual jsonb; begin
 if not (private.rank_challenge('rank-worker','2026-11-06T10:01:00+03')->>'active')::boolean then raise exception 'Twenty-review gate did not open'; end if;
 if exists(select 1 from private.rank_achievements('rank-worker','2026-11-07T10:01:00+03')) then raise exception 'Tie counted as overtake'; end if;
 select sum(coins) into total from private.rank_achievements('rank-worker','2026-11-07T11:01:00+03');
 if total<>90 then raise exception 'First top-ten reward not ninety'; end if;
 mission:=private.rank_challenge('rank-worker','2026-11-07T11:01:00+03');
 if mission->>'targetName'<>'فاطمة' or (mission->>'coins')::numeric<>99 or (mission->>'stars')::numeric<>99 then raise exception 'Next target or reward incorrect: %',mission; end if;
 base:=private.progression_before_rank_challenge('rank-worker','2026-11-08');
 actual:=private.employee_progression('rank-worker','2026-11-08');
 if (actual->>'coins')::numeric-(base->>'coins')::numeric<>90 or (actual->>'stars')::numeric-(base->>'stars')::numeric<>90 then raise exception 'Progression did not include rank reward'; end if;
 if (select sum(coins) from private.coin_achievements('rank-worker'))<>(private.employee_progression('rank-worker')->>'coins')::numeric then raise exception 'Collector double counted rank coins'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"73000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare first jsonb; retried jsonb; begin
 first:=public.collect_coin_achievement('rank:2026-11:10');
 retried:=public.collect_coin_achievement('rank:2026-11:10');
 if (first->>'available')::numeric<>90 or first<>retried then raise exception 'Rank coin collection paid incorrectly'; end if;
 begin perform private.rank_challenge('rank-peer-1'); raise exception 'Another employee mission exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','private.rank_achievements(text,timestamptz)','execute') then raise exception 'Rank award helper exposed'; end if;
 if has_function_privilege('anon','private.avatar_wallet_before_rank(text)','execute') then raise exception 'Wallet bypass exposed'; end if;
end $$;
rollback;
