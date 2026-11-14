begin;
-- Destination tasks write only source columns; browser roles have no access.
create table public.windsor_reviews_inbox (
 review_id text primary key check (length(review_id) between 1 and 1000),
 location_id text not null,
 review_star_rating text not null,
 review_comment text,
 review_create_time timestamptz not null check (isfinite(review_create_time)),
 review_update_time timestamptz check (isfinite(review_update_time)),
 received_at timestamptz not null default clock_timestamp()
);
alter table public.windsor_reviews_inbox enable row level security;
revoke all on public.windsor_reviews_inbox from public, anon, authenticated;
grant select,insert,update on public.windsor_reviews_inbox to service_role;
-- No password or LOGIN is provisioned by a repository migration. The owner
-- enables this dedicated credential separately in the Supabase dashboard.
create role windsor_ingest nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema public to windsor_ingest;
grant select,insert,update,delete on public.windsor_reviews_inbox to windsor_ingest;
create policy windsor_destination_read on public.windsor_reviews_inbox for select to windsor_ingest using(true);
create policy windsor_destination_insert on public.windsor_reviews_inbox for insert to windsor_ingest with check(true);
create policy windsor_destination_update on public.windsor_reviews_inbox for update to windsor_ingest using(true) with check(true);
create policy windsor_destination_delete on public.windsor_reviews_inbox for delete to windsor_ingest using(true);

create table private.windsor_destination_receipts (
 transaction_id bigint primary key,
 received_at timestamptz not null,
 source_rows integer not null default 0,
 new_reviews integer not null default 0,
 updated_reviews integer not null default 0,
 unchanged_reviews integer not null default 0
);
revoke all on private.windsor_destination_receipts from public,anon,authenticated;
grant select,insert,update on private.windsor_destination_receipts to service_role;

-- Trusted ingestion only. service_role ownership intentionally reuses the
-- existing validate_record attribution and branch locking rules.
create function private.ingest_windsor_destination() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 branch_name text; stars integer; local_time timestamp; payload jsonb;
 previous jsonb; added integer:=0; changed integer:=0;
begin
 branch_name:=case new.location_id
  when 'locations/16510748030849104251' then 'شرق'
  when 'locations/3102684010058296265' then 'المملكة'
  when 'locations/9902225787849509285' then 'سلام'
  when 'locations/5313787192350057859' then 'القصر'
  when 'locations/3108762223721282674' then 'جاليري'
  when 'locations/10045625494363697870' then 'ذافيو' end;
 stars:=case new.review_star_rating when 'ONE' then 1 when 'TWO' then 2
  when 'THREE' then 3 when 'FOUR' then 4 when 'FIVE' then 5
  else case when new.review_star_rating ~ '^[1-5]$' then new.review_star_rating::integer end end;
 if branch_name is null or stars is null or length(coalesce(new.review_comment,''))>40000
  or not isfinite(new.review_create_time)
  or (new.review_update_time is not null and (not isfinite(new.review_update_time) or new.review_update_time<new.review_create_time)) then
  raise exception 'Invalid Windsor destination review' using errcode='22023';
 end if;
 local_time:=new.review_create_time at time zone 'Asia/Riyadh';
 payload:=jsonb_build_object('id',new.review_id,'branch',branch_name,'rating',stars::text,
  'reviewerName','عميل','comment',coalesce(new.review_comment,''),
  'date',to_char(local_time,'DD-MM-YYYY'),'time',to_char(local_time,'HH24:MI'),
  'linkedEmployeeIds','[]'::jsonb,'batchId','windsor-api');
 -- Match review triggers' lock order to avoid cross-source deadlocks.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform pg_advisory_xact_lock(hashtextextended('rev4-shift:'||branch_name,0));
 select data into previous from public.reviews where id=new.review_id for update;
 if previous is null then
  insert into public.reviews(id,data) values(new.review_id,payload);
  added:=1;
 elsif previous-array['linkedEmployeeIds','linkedShiftId','batchId'] is distinct from payload-array['linkedEmployeeIds','linkedShiftId','batchId'] then
  update public.reviews set data=payload where id=new.review_id;
  changed:=1;
 end if;
 insert into private.windsor_destination_receipts(transaction_id,received_at,source_rows,new_reviews,updated_reviews,unchanged_reviews)
 values(txid_current(),new.received_at,1,added,changed,1-added-changed)
 on conflict(transaction_id) do update set received_at=excluded.received_at,
  source_rows=windsor_destination_receipts.source_rows+1,
  new_reviews=windsor_destination_receipts.new_reviews+excluded.new_reviews,
  updated_reviews=windsor_destination_receipts.updated_reviews+excluded.updated_reviews,
  unchanged_reviews=windsor_destination_receipts.unchanged_reviews+excluded.unchanged_reviews;
 return new;
end $$;
-- PostgreSQL requires schema CREATE when transferring ownership. Grant it only
-- inside this transaction, preserving any pre-existing privilege.
do $$ declare had_create boolean:=has_schema_privilege('service_role','private','CREATE');
begin
 if not had_create then grant create on schema private to service_role; end if;
 alter function private.ingest_windsor_destination() owner to service_role;
 if not had_create then revoke create on schema private from service_role; end if;
end $$;
revoke all on function private.ingest_windsor_destination() from public,anon,authenticated;
create trigger ingest_windsor_destination after insert or update on public.windsor_reviews_inbox
 for each row execute function private.ingest_windsor_destination();
create function private.stamp_windsor_destination() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 -- Reject stale updates before the AFTER trigger can touch application data.
 if tg_op='UPDATE' and coalesce(new.review_update_time,new.review_create_time)<coalesce(old.review_update_time,old.review_create_time) then return null; end if;
 new.received_at:=clock_timestamp();
 return new;
end $$;
revoke all on function private.stamp_windsor_destination() from public,anon,authenticated;
create trigger stamp_windsor_destination before insert or update on public.windsor_reviews_inbox
 for each row execute function private.stamp_windsor_destination();
commit;
