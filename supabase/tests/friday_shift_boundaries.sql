begin;
-- Synthetic rows only. The entire test is rolled back.
insert into public.branches(id,data) values ('verify-friday','{"id":"verify-friday","name":"verify-friday","start":"16:00","end":"07:00","nextDayTime":"07:00"}');
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name','Verification','branch','verify-friday','role','employee','imageUrl','','points',0,'reviewsCount',0,'stats','{}'::jsonb)
from (values ('verify-thursday-worker'),('verify-friday-worker')) p(id);
insert into public.timeline_events(id,data) values
('verify-thursday-second','{"id":"verify-thursday-second","branch":"verify-friday","type":"shift","title":"Verification","date":"29-10-2026","time":"16:00","endTime":"07:00","endDate":"30-10-2026","employees":[{"id":"verify-thursday-worker","name":"Verification"}]}'),
('verify-friday-first','{"id":"verify-friday-first","branch":"verify-friday","type":"shift","title":"Verification","date":"30-10-2026","time":"07:00","endTime":"16:00","employees":[{"id":"verify-friday-worker","name":"Verification"}]}');
insert into public.reviews(id,data) select id,jsonb_build_object('id',id,'branch','verify-friday','rating','5','date',day,'time',clock,'linkedEmployeeIds','[]'::jsonb)
from (values
('verify-friday-before','29-10-2026','15:59'),
('verify-friday-start','29-10-2026','16:00'),
('verify-friday-midnight','30-10-2026','00:00'),
('verify-friday-last','30-10-2026','13:59'),
('verify-friday-boundary','30-10-2026','14:00')) r(id,day,clock);
do $$ begin
  if (select private.shift_review_end(data) from public.timeline_events where id='verify-thursday-second') <> timestamptz '2026-10-30 14:00:00+03' then raise exception 'Thursday end not normalized'; end if;
  if (select private.shift_review_start(data) from public.timeline_events where id='verify-friday-first') <> timestamptz '2026-10-30 14:00:00+03' then raise exception 'Friday start not normalized'; end if;
  if exists(select 1 from public.reviews where id in ('verify-friday-start','verify-friday-midnight','verify-friday-last') and (employee_ids <> array['verify-thursday-worker'] or data->>'linkedShiftId' is distinct from 'verify-thursday-second')) then raise exception 'Thursday attribution failed'; end if;
  if (select employee_ids from public.reviews where id='verify-friday-boundary') <> array['verify-friday-worker'] then raise exception '14:00 boundary attributed to Thursday'; end if;
  if (select cardinality(employee_ids) from public.reviews where id='verify-friday-before') <> 0 then raise exception '15:59 Thursday attributed to second shift'; end if;
  if exists(select 1 from public.timeline_events t join public.reviews r on t.data->>'reviewId'=r.id where r.id like 'verify-friday-%' and t.employee_ids<>r.employee_ids) then raise exception 'Review mirror attribution mismatch'; end if;
end $$;
-- Old clients cannot restore an early Friday opening or a short Thursday end.
update public.timeline_events set data=data || '{"endTime":"07:00"}'::jsonb where id='verify-thursday-second';
update public.timeline_events set data=data || '{"time":"07:00"}'::jsonb where id='verify-friday-first';
do $$ begin
 if (select data->>'linkedShiftId' from public.reviews where id='verify-friday-last') is distinct from 'verify-thursday-second' then raise exception 'Old client reverted assignment'; end if;
end $$;
rollback;
