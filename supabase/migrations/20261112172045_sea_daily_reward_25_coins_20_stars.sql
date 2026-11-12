-- Update the original daily sea award inside the existing progression chain.
-- Keep eligibility, subsequent rank/tier awards, and existing ACLs unchanged.
do $migration$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('private.progression_before_rank_challenge(text,date)'::regprocedure);
 if position('coins:=coins+sea_count*10;' in definition)=0
 or position('stars:=stars+sea_count*10;' in definition)=0 then
  raise exception 'Unrecognized daily sea progression; refusing to change rewards';
 end if;
 updated:=replace(replace(definition,'coins:=coins+sea_count*10;','coins:=coins+sea_count*25;'),
  'stars:=stars+sea_count*10;','stars:=stars+sea_count*20;');
 execute updated;

 definition:=pg_get_functiondef('private.coin_achievements_before_rank(text)'::regprocedure);
 if position('sea_coins:=private.sea_daily_completed_days(profile,cutoff)*10;' in definition)=0 then
  raise exception 'Unrecognized daily sea collection; refusing to change rewards';
 end if;
 execute replace(definition,'sea_coins:=private.sea_daily_completed_days(profile,cutoff)*10;',
  'sea_coins:=private.sea_daily_completed_days(profile,cutoff)*25;');
end $migration$;

revoke all on function private.progression_before_rank_challenge(text,date) from public,anon,authenticated;
revoke all on function private.coin_achievements_before_rank(text) from public,anon,authenticated;
