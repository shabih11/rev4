begin;
-- Apply the revised partnership tiers to calculations from the update onward.
do $$ declare definition text; begin
 select pg_get_functiondef('private.progression_before_daily_two_update(text,date)'::regprocedure) into definition;
 if position('partnerships>=(array[2,4,6])[grade] then round(10*multiplier,2)' in definition)=0
 or position('partnerships>=(array[2,4,6])[grade] then round(15*multiplier,2)' in definition)=0 then
  raise exception 'Unexpected partnership progression';
 end if;
 definition:=replace(definition,'partnerships>=(array[2,4,6])[grade] then round(10*multiplier,2)',
 'partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade] then round((case when cutoff>=date ''2026-11-12'' then 88 else 10 end)*multiplier,2)');
 definition:=replace(definition,'partnerships>=(array[2,4,6])[grade] then round(15*multiplier,2)',
 'partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade] then round((case when cutoff>=date ''2026-11-12'' then 98 else 15 end)*multiplier,2)');
 execute definition;
 select pg_get_functiondef(coalesce(to_regprocedure('private.coin_achievements_before_rank(text)'),to_regprocedure('private.coin_achievements(text)'))) into definition;
 if position('''partner'',''ثنائي متألق'',10::numeric,partnerships>=(array[2,4,6])[grade]' in definition)=0 then
  raise exception 'Unexpected partnership coin entitlement';
 end if;
 definition:=replace(definition,'''partner'',''ثنائي متألق'',10::numeric,partnerships>=(array[2,4,6])[grade]',
 '''partner'',''ثنائي متألق'',case when cutoff>=date ''2026-11-12'' then 88::numeric else 10::numeric end,partnerships>=(case when cutoff>=date ''2026-11-12'' then array[10,20,30] else array[2,4,6] end)[grade]');
 execute definition;
end $$;
commit;
