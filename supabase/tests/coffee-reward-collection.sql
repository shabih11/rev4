begin;
insert into public.branches(id,data) values('coffee-test','{"id":"coffee-test","name":"coffee-test","start":"10:00","end":"23:00","nextDayTime":"10:00"}');
insert into public.profiles(id,data) values
 ('coffee-a','{"id":"coffee-a","name":"Coffee A","role":"employee","branch":"coffee-test"}'),
 ('coffee-b','{"id":"coffee-b","name":"Coffee B","role":"employee","branch":"coffee-test"}');
insert into auth.users(id,email) values('76000000-0000-4000-8000-000000000001','coffee-a@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values('76000000-0000-4000-8000-000000000001','coffee-a','employee','coffee-test');
insert into public.reviews(id,data) select 'coffee-review-'||n,jsonb_build_object('id','coffee-review-'||n,'branch','coffee-test','rating','5','date','05-11-2026','time','12:00','linkedEmployeeIds',case when n<=4 then jsonb_build_array('coffee-a','coffee-b') else jsonb_build_array('coffee-a') end) from generate_series(1,5) n;
do $$ declare key text; begin
 select id into key from private.coffee_reward_entitlements('coffee-a') where branch='coffee-test' and period=date '2026-11-01' and eligible;
 if key is null then raise exception 'Coffee eligible employee missing'; end if;
 if exists(select 1 from private.coffee_reward_entitlements('coffee-b') where branch='coffee-test' and eligible) then raise exception 'Four contributions incorrectly eligible'; end if;
 if not exists(select 1 from jsonb_array_elements(private.pending_coin_achievements('coffee-a')) item where item->>'id'=key and (item->>'coins')::numeric=125) then raise exception 'Coffee is not separately collectible'; end if;
 if exists(select 1 from jsonb_array_elements(private.pending_coin_achievements('coffee-b')) item where item->>'id' like 'coffee:%') then raise exception 'Ineligible coffee claim exposed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare before jsonb:=public.get_avatar_store()->'wallet'; after jsonb; retried jsonb; begin
 after:=public.collect_coin_achievement('coffee:coffee-test:2026-11-01');
 retried:=public.collect_coin_achievement('coffee:coffee-test:2026-11-01');
 if (after->>'available')::numeric-(before->>'available')::numeric<>125 then raise exception 'Coffee collection amount incorrect'; end if;
 if before->>'stars' is distinct from after->>'stars' then raise exception 'Collecting coins changed stars'; end if;
 if after is distinct from retried then raise exception 'Coffee paid twice'; end if;
 if not exists(select 1 from jsonb_array_elements(after->'coffeeRewards') item where item->>'branch'='coffee-test' and (item->>'collected')::boolean) then raise exception 'Coffee collected status missing'; end if;
 begin perform private.coffee_reward_entitlements('coffee-b'); raise exception 'Private entitlement exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
