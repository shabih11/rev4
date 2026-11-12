begin;
insert into public.branches(id,data) values ('coins-test','{"id":"coins-test","name":"coins-test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name',id,'role',role,'branch','coins-test')
from (values ('coins-a','employee'),('coins-b','employee'),('coins-admin','admin'),('coins-disabled','employee')) p(id,role);
insert into auth.users(id,email)
select ('72000000-0000-4000-8000-00000000000'||n)::uuid,'coins-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.user_access(uid,profile_id,role,branch)
select ('72000000-0000-4000-8000-00000000000'||n)::uuid,id,role,case when role='admin' then null else 'coins-test' end
from (values (1,'coins-a','employee'),(2,'coins-b','employee'),(3,'coins-admin','admin'),(4,'coins-disabled','employee')) p(n,id,role);
insert into public.reviews(id,data)
select 'coins-positive-'||n,jsonb_build_object('id','coins-positive-'||n,'branch','coins-test','rating','5',
 'date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','09:00','linkedEmployeeIds',jsonb_build_array('coins-a','coins-b'))
from generate_series(1,2) n;

do $$ declare wallet jsonb:=private.avatar_wallet('coins-a'); total numeric; begin
 select sum(coins) into total from private.coin_achievements('coins-a');
 if total<>(private.employee_progression('coins-a')->>'coins')::numeric then raise exception 'Entitlements diverge from progression'; end if;
 if (wallet->>'available')::numeric<>0 or (wallet->>'pendingCoins')::numeric<=0 then raise exception 'Uncollected coins spendable'; end if;
 if wallet->>'stars' is distinct from private.employee_progression('coins-a')->>'stars' then raise exception 'Collection changed stars'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare first jsonb; retried jsonb; key text:='ratings:'||to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD'); begin
 begin perform public.collect_coin_achievement('not-earned'); raise exception 'Invented achievement accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.collect_coin_achievement(null); raise exception 'Null achievement accepted'; exception when invalid_parameter_value then null; end;
 first:=public.collect_coin_achievement(key);
 if (first->>'available')::numeric<>10 then raise exception 'Collected amount incorrect'; end if;
 retried:=public.collect_coin_achievement(key);
 if first<>retried then raise exception 'Retry paid twice'; end if;
 begin perform private.avatar_wallet('coins-b'); raise exception 'Another wallet exposed'; exception when insufficient_privilege then null; end;
 begin insert into private.coin_achievement_collections values('coins-a','forged',10000,now()); raise exception 'Direct claim insert'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- New earnings on an already collected source expose only the increment.
insert into public.reviews(id,data) values ('coins-third',jsonb_build_object('id','coins-third','branch','coins-test','rating','4',
 'date',to_char(now() at time zone 'Asia/Riyadh','DD-MM-YYYY'),'time','10:00','linkedEmployeeIds',jsonb_build_array('coins-a')));
do $$ declare pending jsonb:=private.pending_coin_achievements('coins-a'); begin
 if not exists(select 1 from jsonb_array_elements(pending) item where item->>'id' like 'ratings:%' and (item->>'coins')::numeric=5) then raise exception 'New review increment missing'; end if;
end $$;
set local role authenticated;
do $$ declare item jsonb; wallet jsonb; begin
 for item in select value from jsonb_array_elements(public.get_avatar_store()#>'{wallet,pendingAchievements}') loop
  wallet:=public.collect_coin_achievement(item->>'id');
 end loop;
 if (wallet->>'pendingCoins')::numeric<>0 or (wallet->>'available')::numeric<>(wallet->>'earned')::numeric then raise exception 'Collection incomplete'; end if;
end $$;
reset role;

-- Removing and restoring evidence must not allow another payment.
update public.reviews set data=jsonb_set(data,'{rating}','"1"') where id='coins-third';
update public.reviews set data=jsonb_set(data,'{rating}','"4"') where id='coins-third';
do $$ begin
 if private.pending_coin_achievements('coins-a')<>'[]' then raise exception 'Restored evidence paid twice'; end if;
end $$;

-- Simulate rollout baseline: previously earned coins remain fully available.
insert into private.coin_achievement_collections(profile_id,achievement_id,coins)
 select 'coins-b',id,coins from private.coin_achievements('coins-b') where coins>0;
do $$ begin
 if private.avatar_wallet('coins-b')->>'available' is distinct from private.avatar_wallet_before_collection('coins-b')->>'available' then raise exception 'Existing balance changed'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.collect_coin_achievement('legacy'); raise exception 'Admin collected employee coins'; exception when insufficient_privilege then null; end;
 perform public.merge_employees('coins-a','coins-b','Coins merged','coins-test');
end $$;
reset role;
do $$ begin
 if private.pending_coin_achievements('coins-a')<>'[]' then raise exception 'Merge reset collected achievements'; end if;
 if exists(select 1 from private.coin_achievement_collections where profile_id='coins-b') then raise exception 'Merged marks orphaned'; end if;
 if has_function_privilege('anon','public.collect_coin_achievement(text)','execute') then raise exception 'Anonymous collection exposed'; end if;
 if has_function_privilege('authenticated','private.avatar_wallet_before_collection(text)','execute') then raise exception 'Automatic wallet bypass exposed'; end if;
 if has_function_privilege('authenticated','private.merge_employees_before_coin_collection(text,text,text,text)','execute') then raise exception 'Merge bypass exposed'; end if;
 if has_table_privilege('authenticated','private.coin_achievement_collections','select,insert,update,delete') then raise exception 'Claim ledger exposed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.collect_coin_achievement('legacy'); raise exception 'Anonymous collection succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
