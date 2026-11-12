begin;
insert into public.branches(id,data) values ('sea-reward-test','{"id":"sea-reward-test","name":"Sea test","start":"07:00","end":"23:00","nextDayTime":"07:00"}');
insert into public.branches(id,data) values ('جاليري','{"id":"جاليري","name":"جاليري","start":"14:00","end":"23:00","nextDayTime":"14:00"}') on conflict do nothing;
insert into public.profiles(id,data) values
 ('sea-daily-a','{"id":"sea-daily-a","name":"Sea A","role":"employee","branch":"جاليري"}'),
 ('sea-daily-b','{"id":"sea-daily-b","name":"Sea B","role":"employee","branch":"جاليري"}'),
 ('sea-daily-other','{"id":"sea-daily-other","name":"Other","role":"employee","branch":"sea-reward-test"}');
insert into auth.users(id,email) values ('72000000-0000-4000-8000-000000000001','sea-test@example.invalid');
insert into public.sea_mission_completions(branch,day,approved_at,approved_by)
values ('جاليري',5,'2026-11-05T16:00:00+03:00','72000000-0000-4000-8000-000000000001') on conflict do nothing;
do $$ declare days integer; base jsonb; actual jsonb; again jsonb; begin
 days:=private.sea_daily_completed_days('sea-daily-a','2026-11-11');
 if days<1 then raise exception 'Completed branch day missing'; end if;
 if private.sea_daily_completed_days('sea-daily-b','2026-11-11')<>days then raise exception 'Noncontributing branch member excluded'; end if;
 if private.sea_daily_completed_days('sea-daily-other','2026-11-11')<>0 then raise exception 'Other branch rewarded'; end if;
 if private.sea_daily_completed_days('sea-daily-a','2026-11-04')<>0 then raise exception 'Reward before campaign'; end if;
 base:=private.progression_before_sea_daily('sea-daily-a','2026-11-11');
 actual:=private.employee_progression('sea-daily-a','2026-11-11');
 again:=private.employee_progression('sea-daily-a','2026-11-11');
 if (actual->>'coins')::numeric-coalesce((base->>'coins')::numeric,0)<>days*10
 or (actual->>'stars')::numeric-coalesce((base->>'stars')::numeric,0)<>days*10
 then raise exception 'Daily amount differs from ten'; end if;
 if again<>actual then raise exception 'Repeated read changed reward'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform private.sea_daily_completed_days('sea-daily-a','2026-11-11'); raise exception 'Private reward exposed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
