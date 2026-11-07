begin;
create or replace function private.validate_record() returns trigger
language plpgsql set search_path = '' as $$
declare ids text[]; who text; allowed text[]; day date; end_at timestamptz; linked public.timeline_events; actor text := private.account_role();
begin
  if tg_op='DELETE' then
    if tg_table_name='profiles' and (
      exists(select 1 from public.reviews where old.id=any(employee_ids)) or
      exists(select 1 from public.timeline_events where old.id=any(employee_ids))) then
      raise exception 'Profile still has linked records' using errcode='23503';
    end if;
    return old;
  end if;
  if octet_length(new.data::text)>200000 or new.data->>'id' is distinct from new.id then
    raise exception 'Invalid record';
  end if;
  if tg_table_name='profiles' then
    allowed:=array['id','name','branch','role','imageUrl','points','reviewsCount','monthReviewsCount','stats','manualStats','code','aliases','assignedBranches'];
    if new.data - allowed <> '{}'::jsonb then raise exception 'Unsupported profile fields'; end if;
    if tg_op='UPDATE' and actor is not null and actor<>'admin' and
      new.data-array['name','imageUrl'] is distinct from old.data-array['name','imageUrl'] then
      raise exception 'Only profile name and image may be edited' using errcode='42501';
    end if;
    return new;
  end if;
  if tg_table_name='branches' then
    if new.data - array['id','name','start','end','nextDayTime','googleApi'] <> '{}'::jsonb then raise exception 'Unsupported branch fields'; end if;
    perform private.record_at('2026-01-01',new.data->>'start');
    perform private.record_at('2026-01-01',new.data->>'end');
    perform private.record_at('2026-01-01',new.data->>'nextDayTime');
    return new;
  end if;
  if tg_table_name='reviews' then
    if new.data - array['id','reviewerName','rating','comment','date','time','branch','linkedEmployeeIds','linkedShiftId','batchId'] <> '{}'::jsonb then raise exception 'Unsupported review fields'; end if;
    perform pg_advisory_xact_lock(hashtextextended('rev4-shift:'||(new.data->>'branch'),0));
    -- Preserve assignments from the locked row, never from an earlier importer read.
    if current_user='service_role' then
      if tg_op='UPDATE' and new.data->>'branch'=old.data->>'branch' and new.data->>'date'=old.data->>'date' and new.data->>'time'=old.data->>'time' then
        new.data:=(new.data-array['linkedEmployeeIds','linkedShiftId'])||jsonb_build_object('linkedEmployeeIds',old.data->'linkedEmployeeIds');
        if old.data ? 'linkedShiftId' then new.data:=new.data||jsonb_build_object('linkedShiftId',old.data->>'linkedShiftId'); end if;
      else
        new.data:=(new.data-array['linkedEmployeeIds','linkedShiftId'])||jsonb_build_object('linkedEmployeeIds','[]'::jsonb);
      end if;
    end if;
    if tg_op='INSERT' or (current_user='service_role' and tg_op='UPDATE' and (new.data->>'branch' is distinct from old.data->>'branch' or new.data->>'date' is distinct from old.data->>'date' or new.data->>'time' is distinct from old.data->>'time')) then
      select * into linked from public.timeline_events t where t.kind='shift' and t.branch=new.data->>'branch' and
        private.record_at(new.data->>'date',new.data->>'time')>=t.occurred_at and private.record_at(new.data->>'date',new.data->>'time')<t.ends_at;
      if found then new.data:=new.data||jsonb_build_object('linkedShiftId',linked.id,'linkedEmployeeIds',to_jsonb(linked.employee_ids)); end if;
    end if;
    select coalesce(array_agg(value order by value),'{}') into ids from jsonb_array_elements_text(new.data->'linkedEmployeeIds');
    if new.data ? 'linkedShiftId' and not exists(select 1 from public.timeline_events t where t.id=new.data->>'linkedShiftId' and t.kind='shift' and t.branch=new.data->>'branch' and t.employee_ids=ids and
      private.record_at(new.data->>'date',new.data->>'time')>=t.occurred_at and private.record_at(new.data->>'date',new.data->>'time')<t.ends_at) then
      raise exception 'Review does not match linked shift' using errcode='23503';
    end if;
    if actor='manager' and (tg_op='INSERT' or new.data-array['linkedEmployeeIds','linkedShiftId'] is distinct from old.data-array['linkedEmployeeIds','linkedShiftId']) then
      raise exception 'Managers may only link reviews' using errcode='42501';
    end if;
  else
    if new.data - array['id','branch','type','title','time','endTime','date','endDate','comment','employees','employeeIds','reviewId','batchId','createdBy'] <> '{}'::jsonb then raise exception 'Unsupported timeline fields'; end if;
    ids:=private.member_ids(new.data->'employees');
    if new.data->>'type'='shift' then
      if cardinality(ids)=0 then raise exception 'A shift requires employees'; end if;
      day:=private.record_day(new.data->>'date');
      end_at:=private.record_end(new.data);
      if end_at<=private.record_at(new.data->>'date',new.data->>'time') or end_at-private.record_at(new.data->>'date',new.data->>'time')>interval '24 hours' then raise exception 'Invalid shift interval'; end if;
      perform pg_advisory_xact_lock(hashtextextended('rev4-shift:'||(new.data->>'branch'),0));
      if exists(select 1 from public.timeline_events t where t.kind='shift' and t.branch=new.data->>'branch' and t.id<>new.id and
        t.occurred_at<end_at and t.ends_at>private.record_at(new.data->>'date',new.data->>'time')) then
        raise exception 'Overlapping shifts' using errcode='23P01';
      end if;
      if actor='manager' and not (date_trunc('month',day)=date_trunc('month',now() at time zone 'Asia/Riyadh') or
        (extract(day from now() at time zone 'Asia/Riyadh')<=2 and date_trunc('month',day)=date_trunc('month',(now() at time zone 'Asia/Riyadh')-interval '1 month'))) then
        raise exception 'Shift month is closed' using errcode='42501';
      end if;
    end if;
    if actor='employee' and (new.data->>'type'<>'gap' or ids<>array[private.account_profile()] or new.data->>'createdBy' is distinct from auth.uid()::text) then
      raise exception 'Invalid employee note' using errcode='42501';
    end if;
    new.data:=new.data-'employeeIds';
  end if;
  if cardinality(ids)<> (select count(distinct x) from unnest(ids) x) or cardinality(ids)>30 then raise exception 'Duplicate or excessive members'; end if;
  foreach who in array ids loop
    if not exists(select 1 from public.profiles p where p.id=who and p.data->>'role'='employee' and
      (p.branch=new.data->>'branch' or coalesce(p.data->'assignedBranches','[]') ? (new.data->>'branch'))) then
      raise exception 'Employee not assigned to branch' using errcode='23503';
    end if;
  end loop;
  new.employee_ids:=ids;
  return new;
end $$;
commit;
