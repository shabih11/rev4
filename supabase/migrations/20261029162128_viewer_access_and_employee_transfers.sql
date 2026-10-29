begin;
-- A separate, server-owned read-only role. It is never inferred from user metadata.
alter table public.profiles drop constraint profiles_data_check2;
alter table public.profiles add constraint profiles_data_check2 check(coalesce(data->>'role','') in ('admin','manager','employee','viewer'));
alter table public.user_access drop constraint user_access_role_check;
alter table public.user_access add constraint user_access_role_check check(role in ('admin','manager','employee','viewer'));
alter table public.user_access drop constraint user_access_check;
alter table public.user_access add constraint user_access_check check(role in ('admin','viewer') or branch is not null);
alter policy profiles_self on public.profiles
 using(id=(select private.account_profile()) and (select private.account_role()) in ('employee','manager','admin'))
 with check(id=(select private.account_profile()) and (select private.account_role()) in ('employee','manager','admin'));

create or replace function public.rename_me(new_name text, previous_name text) returns void
language plpgsql set search_path='' as $$
declare profile text := private.account_profile(); actual text;
begin
 if private.account_role() is null or private.account_role() not in ('admin','employee') or profile is null or length(trim(new_name)) not between 1 and 120 then raise exception 'Profile rename unavailable' using errcode='42501'; end if;
 select data->>'name' into actual from public.profiles where id=profile for update;
 if actual is distinct from previous_name then raise exception 'write-conflict' using errcode='40001'; end if;
 update public.profiles set data=jsonb_set(data,'{name}',to_jsonb(trim(new_name))) where id=profile;
end $$;

-- Transfer profile and employee sign-in membership together; optimistic checks reject stale choices.
create function public.transfer_employee(employee_id text, requested_branch text, expected_branch text, expected_mobile boolean) returns void
language plpgsql security definer set search_path='' as $$
declare profile jsonb; mobile boolean := requested_branch='موظفة خارجية';
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if requested_branch is null or expected_mobile is null or (not mobile and not exists(select 1 from public.branches where id=requested_branch)) then raise exception 'Invalid branch' using errcode='22023'; end if;
 -- Match normal UI saves and merge lock ordering.
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 select data into profile from public.profiles where id=employee_id for update;
 if profile is null or profile->>'role'<>'employee' or private.employee_is_disabled(employee_id) then raise exception 'Employee unavailable' using errcode='42501'; end if;
 if profile->>'branch' is distinct from expected_branch or coalesce(profile->'isCoverage'='true'::jsonb,false) is distinct from expected_mobile then raise exception 'write-conflict' using errcode='40001'; end if;
 update public.profiles set data=data||jsonb_build_object('branch',requested_branch,'isCoverage',mobile,
   'assignedBranches',case when mobile then coalesce(data->'assignedBranches','[]'::jsonb)||jsonb_build_array(data->>'branch') else jsonb_build_array(requested_branch) end)
 where id=employee_id;
 if not mobile then update public.user_access set branch=requested_branch where profile_id=employee_id and role='employee'; end if;
end $$;
revoke all on function public.transfer_employee(text,text,text,boolean) from public,anon;
grant execute on function public.transfer_employee(text,text,text,boolean) to authenticated;

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
    if new.data - array['id','branch','type','title','time','endTime','date','endDate','comment','employees','employeeIds','reviewId','batchId','createdBy','requestStatus','requestedShift','rejectedAt'] <> '{}'::jsonb then raise exception 'Unsupported timeline fields'; end if;
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
       (tg_table_name='reviews' and new.data ? 'linkedShiftId' and exists(
         select 1 from public.timeline_events t where t.id=new.data->>'linkedShiftId' and t.kind='shift' and who=any(t.employee_ids))))) then
      raise exception 'Employee not assigned to branch' using errcode='23503';
    end if;
  end loop;
  new.employee_ids:=ids;
  return new;
end $$;


commit;
