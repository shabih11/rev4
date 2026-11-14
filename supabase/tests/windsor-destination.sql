begin;
insert into public.branches(id,data) values ('شرق','{"id":"شرق","name":"شرق","start":"07:00","end":"23:00","nextDayTime":"07:00"}') on conflict do nothing;
insert into public.profiles(id,data) values ('windsor-test-employee','{"id":"windsor-test-employee","name":"Test","role":"employee","branch":"شرق"}');
insert into public.timeline_events(id,data) values ('windsor-test-shift',jsonb_build_object(
 'id','windsor-test-shift','branch','شرق','type','shift','title','Test',
 'date',to_char(current_date,'DD-MM-YYYY'),'time','16:00','endTime','23:00',
 'employees',jsonb_build_array(jsonb_build_object('id','windsor-test-employee','name','Test'))));
set local role service_role;
insert into public.windsor_reviews_inbox(review_id,location_id,review_star_rating,review_comment,review_create_time,review_update_time)
values('windsor-destination-test','locations/16510748030849104251','FIVE','First',
 (current_date+time '17:00') at time zone 'Asia/Riyadh',(current_date+time '17:00') at time zone 'Asia/Riyadh');
do $$ begin
 if not exists(select 1 from public.reviews where id='windsor-destination-test' and rating=5 and data->>'time'='17:00'
  and data->>'linkedShiftId'='windsor-test-shift' and employee_ids=array['windsor-test-employee']) then raise exception 'Import or shift attribution failed'; end if;
end $$;
-- Matching exports and GitHub imports must converge to the same review id.
insert into public.windsor_reviews_inbox(review_id,location_id,review_star_rating,review_comment,review_create_time,review_update_time)
select review_id,location_id,review_star_rating,review_comment,review_create_time,review_update_time
from public.windsor_reviews_inbox where review_id='windsor-destination-test'
on conflict(review_id) do update set review_comment=excluded.review_comment;
update public.windsor_reviews_inbox set review_comment='Changed',review_update_time=review_update_time+interval '1 minute'
where review_id='windsor-destination-test';
do $$ begin
 if (select count(*) from public.reviews where id='windsor-destination-test')<>1 then raise exception 'Duplicate review'; end if;
 if not exists(select 1 from public.reviews where id='windsor-destination-test' and data->>'comment'='Changed'
 and data->>'linkedShiftId'='windsor-test-shift' and employee_ids=array['windsor-test-employee']) then raise exception 'Update lost assignments'; end if;
 if not exists(select 1 from private.windsor_destination_receipts where transaction_id=txid_current()
 and source_rows=3 and new_reviews=1 and updated_reviews=1 and unchanged_reviews=1) then raise exception 'Receipt counts incorrect'; end if;
 begin
  update public.windsor_reviews_inbox set location_id='unknown' where review_id='windsor-destination-test';
  raise exception 'Unknown location accepted';
 exception when invalid_parameter_value then null; end;
 begin
  update public.windsor_reviews_inbox set review_star_rating='6' where review_id='windsor-destination-test';
  raise exception 'Invalid rating accepted';
 exception when invalid_parameter_value then null; end;
end $$;
update public.windsor_reviews_inbox set review_comment='Stale',review_update_time=review_create_time
where review_id='windsor-destination-test';
do $$ begin
 if (select data->>'comment' from public.reviews where id='windsor-destination-test')<>'Changed' then raise exception 'Stale export overwrote review'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform 1 from public.windsor_reviews_inbox; raise exception 'Inbox exposed'; exception when insufficient_privilege then null; end;
 begin insert into public.windsor_reviews_inbox(review_id) values('forged'); raise exception 'Inbox writable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.windsor_reviews_inbox','select') or has_table_privilege('authenticated','public.windsor_reviews_inbox','insert')
 or has_function_privilege('anon','private.ingest_windsor_destination()','execute')
 or has_function_privilege('authenticated','private.ingest_windsor_destination()','execute') then raise exception 'Ingestion privileges exposed'; end if;
end $$;
rollback;
