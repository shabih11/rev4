begin;
-- Review attribution uses business opening boundaries independently of the
-- originally recorded shift times. Historical employees and hours are retained.
create function private.shift_review_start(value jsonb) returns timestamptz
language sql immutable security invoker set search_path = '' as $$
  select case when extract(isodow from private.record_day(value->>'date'))=5
    and (private.record_at(value->>'date',value->>'time') at time zone 'Asia/Riyadh')::time < time '16:00'
    then private.record_at(value->>'date','14:00')
    when extract(isodow from private.record_day(value->>'date'))=4
    and (private.record_at(value->>'date',value->>'time') at time zone 'Asia/Riyadh')::time >= time '16:00'
    then private.record_at(value->>'date','16:00')
    else private.record_at(value->>'date',value->>'time') end;
$$;
create function private.shift_review_end(value jsonb) returns timestamptz
language sql immutable security invoker set search_path = '' as $$
  select case when extract(isodow from private.record_day(value->>'date'))=4
    and (private.record_at(value->>'date',value->>'time') at time zone 'Asia/Riyadh')::time >= time '16:00'
    then private.record_at(to_char(private.record_day(value->>'date')+1,'YYYY-MM-DD'),'14:00')
    else private.record_end(value) end;
$$;
revoke all on function private.shift_review_start(jsonb), private.shift_review_end(jsonb) from public, anon;
grant execute on function private.shift_review_start(jsonb), private.shift_review_end(jsonb) to authenticated, service_role;

-- Review and overlap comparisons use effective business intervals.
-- Existing role, membership and date-window checks remain unchanged.
CREATE OR REPLACE FUNCTION private.validate_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    allowed:=array['id','name','branch','role','imageUrl','points','reviewsCount','monthReviewsCount','stats','manualStats','code','aliases','assignedBranches','isCoverage'];
    if new.data - allowed <> '{}'::jsonb then raise exception 'Unsupported profile fields'; end if;
    if new.data ? 'isCoverage' and jsonb_typeof(new.data->'isCoverage') <> 'boolean' then raise exception 'Invalid coverage flag'; end if;
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
        private.record_at(new.data->>'date',new.data->>'time')>=private.shift_review_start(t.data) and private.record_at(new.data->>'date',new.data->>'time')<private.shift_review_end(t.data);
      if found then new.data:=new.data||jsonb_build_object('linkedShiftId',linked.id,'linkedEmployeeIds',to_jsonb(linked.employee_ids)); end if;
    end if;
    select coalesce(array_agg(value order by value),'{}') into ids from jsonb_array_elements_text(new.data->'linkedEmployeeIds');
    if new.data ? 'linkedShiftId' and not exists(select 1 from public.timeline_events t where t.id=new.data->>'linkedShiftId' and t.kind='shift' and t.branch=new.data->>'branch' and t.employee_ids=ids and
      private.record_at(new.data->>'date',new.data->>'time')>=private.shift_review_start(t.data) and private.record_at(new.data->>'date',new.data->>'time')<private.shift_review_end(t.data)) then
      raise exception 'Review does not match linked shift' using errcode='23503';
    end if;
    if actor='manager' and (tg_op='INSERT' or new.data-array['linkedEmployeeIds','linkedShiftId'] is distinct from old.data-array['linkedEmployeeIds','linkedShiftId']) then
      raise exception 'Managers may only link reviews' using errcode='42501';
    end if;
  else
    if new.data - array['id','branch','type','title','time','endTime','date','endDate','comment','employees','employeeIds','reviewId','batchId','createdBy','requestStatus','requestedShift','rejectedAt'] <> '{}'::jsonb then raise exception 'Unsupported timeline fields'; end if;
    ids:=private.member_ids(new.data->'employees');
    if new.data->>'type'='shift' then
      if cardinality(ids)=0 then raise exception 'A shift requires employees'; end if;
      day:=private.record_day(new.data->>'date');
      end_at:=private.record_end(new.data);
      if end_at<=private.record_at(new.data->>'date',new.data->>'time') or end_at-private.record_at(new.data->>'date',new.data->>'time')>interval '24 hours' then raise exception 'Invalid shift interval'; end if;
      perform pg_advisory_xact_lock(hashtextextended('rev4-shift:'||(new.data->>'branch'),0));
      if exists(select 1 from public.timeline_events t where t.kind='shift' and t.branch=new.data->>'branch' and t.id<>new.id and
        private.shift_review_start(t.data)<private.shift_review_end(new.data) and private.shift_review_end(t.data)>private.shift_review_start(new.data)) then
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
    if new.data ? 'requestStatus' then
      if new.data->>'type' <> 'gap' or coalesce(new.data->>'requestStatus','') not in ('pending','accepted','rejected') or
        coalesce(new.data->>'requestedShift','') not in ('first','second') or cardinality(ids) <> 1 then
        raise exception 'Invalid shift request' using errcode='23514';
      end if;
      if actor='employee' then
        day:=private.record_day(new.data->>'date');
        if new.data->>'requestStatus' <> 'pending' or day > (now() at time zone 'Asia/Riyadh')::date or
          day < (now() at time zone 'Asia/Riyadh')::date - 2 or new.data ? 'rejectedAt' then
          raise exception 'Shift request window closed' using errcode='42501';
        end if;
        new.data:=jsonb_set(new.data,'{employees}',jsonb_build_array(jsonb_build_object('id',private.account_profile(),'name',(select p.data->>'name' from public.profiles p where p.id=private.account_profile()))));
        if exists(select 1 from public.timeline_events t where t.kind='gap' and t.id<>new.id and t.branch=new.data->>'branch' and
          t.employee_ids=ids and t.data->>'date'=new.data->>'date' and t.data->>'requestedShift'=new.data->>'requestedShift' and t.data->>'requestStatus' in ('pending','accepted')) then
          raise exception 'Shift request already exists' using errcode='23505';
        end if;
      end if;
      if new.data->>'requestStatus'='rejected' then
        if tg_op='INSERT' or old.data->>'requestStatus' is distinct from 'rejected' then
          new.data:=jsonb_set(new.data,'{rejectedAt}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint));
        else
          new.data:=jsonb_set(new.data,'{rejectedAt}',old.data->'rejectedAt');
        end if;
      elsif new.data ? 'rejectedAt' then
        raise exception 'Unexpected rejection time' using errcode='23514';
      end if;
    elsif actor='employee' then
      raise exception 'Shift request metadata required' using errcode='42501';
    end if;
    new.data:=new.data-'employeeIds';
  end if;
  if cardinality(ids)<> (select count(distinct x) from unnest(ids) x) or cardinality(ids)>30 then raise exception 'Duplicate or excessive members'; end if;
  foreach who in array ids loop
    if not exists(select 1 from public.profiles p where p.id=who and p.data->>'role'='employee' and
      (p.branch=new.data->>'branch' or p.data->'isCoverage'='true'::jsonb or
       -- Existing records retain historical membership after transfers.
       -- Admin reconciliation also preserves the historical branch grants used by merges.
       (tg_op='UPDATE' and old.branch=new.data->>'branch' and old.occurred_at=private.record_at(new.data->>'date',new.data->>'time') and
        (who=any(old.employee_ids) or (actor='admin' and coalesce(p.data->'assignedBranches','[]') ? (new.data->>'branch')))) or
       (tg_table_name='timeline_events' and new.data->>'type'='review' and exists(
         select 1 from public.reviews r where r.id=new.data->>'reviewId' and r.branch=new.data->>'branch' and who=any(r.employee_ids))) or
       (tg_table_name='reviews' and new.data ? 'linkedShiftId' and exists(
         select 1 from public.timeline_events t where t.id=new.data->>'linkedShiftId' and t.kind='shift' and who=any(t.employee_ids))))) then
      raise exception 'Employee not assigned to branch' using errcode='23503';
    end if;
  end loop;
  new.employee_ids:=ids;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.relink_shift_reviews()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare affected text[];
begin
  if tg_op='DELETE' then if old.kind<>'shift' then return old; end if; affected:=array[old.branch];
  else if new.kind<>'shift' and (tg_op='INSERT' or old.kind<>'shift') then return new; end if; affected:=case when tg_op='UPDATE' then array[old.branch,new.branch] else array[new.branch] end; end if;
  -- The shift and all review assignments commit together; boundaries are [start,end).
  update public.reviews r set data=(r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=private.shift_review_start(s.data) and r.occurred_at<private.shift_review_end(s.data)),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb))
  where r.branch=any(affected) and r.data is distinct from ((r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=private.shift_review_start(s.data) and r.occurred_at<private.shift_review_end(s.data)),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb)));
  return coalesce(new,old);
end $function$
;

-- Refresh once per affected branch through existing triggers. No shift times
-- or memberships change; derived assignments, mirrors and cache are refreshed.
select pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
update public.timeline_events set data=data where id in (
  select min(id) from public.timeline_events where kind='shift'
    and extract(isodow from occurred_at at time zone 'Asia/Riyadh') in (4,5)
  group by branch
);
commit;
