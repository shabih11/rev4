begin;
insert into public.branches(id,data) values ('recovery-test-branch','{"id":"recovery-test-branch","name":"Recovery test","start":"07:00","end":"16:00","nextDayTime":"07:00"}');
create temporary table recovery_cases (
 id text, positives integer, negatives integer, shared integer,
 manual_balance numeric, manual_negative numeric, complaints numeric, safety numeric, expected numeric
);
insert into recovery_cases values
 ('recovery-20',20,2,1,0,0,0,0,10),
 ('recovery-21',21,2,1,0,0,0,0,10.125),
 ('recovery-24',24,2,1,0,0,0,0,10.5),
 ('recovery-28',28,2,1,0,0,0,0,11),
 ('recovery-cap',40,0,1,0,0,0,0,11),
 ('recovery-bank',24,1,1,0,0,0,0,11),
 ('recovery-shared',42,2,2,0,0,0,0,10.625),
 ('recovery-debt',28,6,1,0,0,0,0,9),
 ('recovery-debt-partial',29,6,1,0,0,0,0,9.125),
 ('recovery-manual',24,1,1,-4,-0.25,0,0,10.25),
 ('recovery-conduct',28,2,1,0,0,1,1,9);
insert into public.profiles(id,data)
select id,jsonb_build_object('id',id,'name','Recovery test','branch','recovery-test-branch','role','employee',
 'manualStats',jsonb_build_object('monthReviews',manual_balance,'negative',manual_negative,'complaints',complaints,'safety',safety))
from recovery_cases;
insert into public.profiles(id,data) values ('recovery-shared-other',
 '{"id":"recovery-shared-other","name":"Recovery shared test","branch":"recovery-test-branch","role":"employee"}');
insert into public.reviews(id,data)
select id||'-review-'||n,jsonb_build_object('id',id||'-review-'||n,'branch','recovery-test-branch',
 'rating',case when n<=positives then '5' else '1' end,
 'date',case when n<=positives then '04-11-2026' else '05-11-2026' end,'time','12:00',
 'linkedEmployeeIds',case when shared=1 then jsonb_build_array(id) else jsonb_build_array(id,'recovery-shared-other') end)
from recovery_cases cross join lateral generate_series(1,positives+negatives) n;
do $$
declare mismatches integer; actual numeric;
begin
 select count(*) into mismatches from recovery_cases c
 left join private.employee_scores('2026-11-08T12:00:00+03:00') s on s.profile_id=c.id
 where s.points is distinct from c.expected or s.balance is distinct from round(c.positives::numeric/c.shared+c.manual_balance,1);
 if mismatches<>0 then raise exception 'Monthly recovery or shared/manual balance mismatch'; end if;
 select points into actual from private.employee_scores('2026-11-05T00:00:00+03:00') where profile_id='recovery-bank';
 if actual is distinct from 11::numeric then raise exception 'Unused surplus exceeded score ceiling'; end if;
 select points into actual from private.employee_scores('2026-11-04T00:00:00+03:00') where profile_id='recovery-28';
 if actual is distinct from 6::numeric then raise exception 'Future reviews counted before cutoff'; end if;
 select points into actual from private.employee_scores('2026-12-01T12:00:00+03:00') where profile_id='recovery-28';
 if actual is distinct from 6::numeric then raise exception 'Previous month carried into recovery'; end if;
 if has_function_privilege('anon','private.employee_scores(timestamptz)','execute')
 or has_function_privilege('authenticated','private.employee_scores(timestamptz)','execute') then
  raise exception 'Internal scores became directly callable';
 end if;
end $$;
insert into public.reviews(id,data) values ('recovery-next-month','{"id":"recovery-next-month","branch":"recovery-test-branch","rating":"1","date":"02-12-2026","time":"12:00","linkedEmployeeIds":["recovery-28"]}');
do $$ begin
 if (select points from private.employee_scores('2026-12-03T12:00:00+03:00') where profile_id='recovery-28') is distinct from 5.5::numeric then
  raise exception 'Previous month surplus offset a new month negative';
 end if;
end $$;
rollback;
