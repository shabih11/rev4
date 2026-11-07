-- Local UI integration; apply separately after review. No data import.
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
      (p.branch=new.data->>'branch' or coalesce(p.data->'assignedBranches','[]') ? (new.data->>'branch'))) then
      raise exception 'Employee not assigned to branch' using errcode='23503';
    end if;
  end loop;
  new.employee_ids:=ids;
  return new;
end $$;

-- Prevent simultaneous duplicate reminders even through direct authenticated inserts.
create unique index unique_open_shift_request on public.timeline_events
  (branch, private.record_day(data->>'date'), (data->>'requestedShift'), employee_ids)
  where kind='gap' and data->>'requestStatus' in ('pending','accepted');

-- Contact and merge requests are isolated from private account details.
create table public.management_contact (
  id text primary key check (id='administration'),
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$')
);
alter table public.management_contact enable row level security;
revoke all on public.management_contact from anon, authenticated;
grant select, insert, update on public.management_contact to authenticated;
create policy contact_member_read on public.management_contact for select to authenticated
  using ((select private.account_role()) is not null);
create policy contact_admin_insert on public.management_contact for insert to authenticated
  with check ((select private.account_role())='admin');
create policy contact_admin_update on public.management_contact for update to authenticated
  using ((select private.account_role())='admin') with check ((select private.account_role())='admin');

create table public.employee_merge_requests (
  id uuid primary key default gen_random_uuid(),
  branch text not null references public.branches(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary_id text not null,
  duplicate_id text not null check (primary_id <> duplicate_id),
  name text not null check (length(trim(name)) between 1 and 120),
  target_branch text not null references public.branches(id),
  is_coverage boolean not null default true,
  status text not null default 'pending' check (status in ('pending','reviewed','rejected'))
);
alter table public.employee_merge_requests enable row level security;
revoke all on public.employee_merge_requests from anon, authenticated;
grant select on public.employee_merge_requests to authenticated;
grant insert(id,branch,primary_id,duplicate_id,name,target_branch,is_coverage) on public.employee_merge_requests to authenticated;
grant update(status) on public.employee_merge_requests to authenticated;
create policy merge_request_read on public.employee_merge_requests for select to authenticated
  using ((select private.account_role())='admin' or ((select private.account_role())='manager' and branch=(select private.account_branch())));
create policy merge_request_insert on public.employee_merge_requests for insert to authenticated
  with check ((select private.account_role())='manager' and branch=(select private.account_branch()) and created_by=(select auth.uid()) and status='pending'
    and exists(select 1 from public.profiles p where p.id=primary_id and p.data->>'role'='employee')
    and exists(select 1 from public.profiles p where p.id=duplicate_id and p.data->>'role'='employee'));
create policy merge_request_update on public.employee_merge_requests for update to authenticated
  using ((select private.account_role())='admin') with check ((select private.account_role())='admin');
create index merge_requests_branch_status on public.employee_merge_requests(branch,status);

-- A manager can create only an empty employee profile in her own branch.
create policy profiles_manager_create on public.profiles for insert to authenticated with check (
  (select private.account_role())='manager' and branch=(select private.account_branch()) and
  data - array['id','name','branch','imageUrl','role','points','reviewsCount','stats'] = '{}'::jsonb and
  data->>'role'='employee' and data->'points'='0'::jsonb and data->'reviewsCount'='0'::jsonb and
  data->'stats'='{"positive":0,"negative":0,"complaints":0,"safety":0}'::jsonb and data->>'imageUrl'=''
);
create function public.register_branch_employee(employee_name text, requested_branch text) returns void
language plpgsql security invoker set search_path='' as $$
declare identifier text := 'employee-'||gen_random_uuid()::text;
begin
  if private.account_role() is distinct from 'manager' or private.account_branch() is distinct from requested_branch or
    length(trim(employee_name)) not between 1 and 120 or not exists(select 1 from public.branches where id=requested_branch) then
    raise exception 'Branch manager required' using errcode='42501';
  end if;
  insert into public.profiles(id,data) values(identifier,jsonb_build_object('id',identifier,'name',trim(employee_name),'branch',requested_branch,'imageUrl','','role','employee','points',0,'reviewsCount',0,'stats',jsonb_build_object('positive',0,'negative',0,'complaints',0,'safety',0)));
end $$;
revoke all on function public.register_branch_employee(text,text) from public,anon;
grant execute on function public.register_branch_employee(text,text) to authenticated;

-- Approval cannot commit without the corresponding employee assignment.
create function private.check_shift_request_approval() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.data->>'requestStatus'='accepted' and (tg_op='INSERT' or old.data->>'requestStatus' is distinct from 'accepted') then
    if not exists(select 1 from public.timeline_events s where s.kind='shift' and s.branch=new.branch and
      private.record_day(s.data->>'date')=private.record_day(new.data->>'date') and new.employee_ids <@ s.employee_ids and
      ((s.occurred_at at time zone 'Asia/Riyadh')::time < time '16:00')=(new.data->>'requestedShift'='first')) then
      raise exception 'Accepted request requires a recorded shift' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create constraint trigger shift_request_approval after insert or update on public.timeline_events
  deferrable initially deferred for each row execute function private.check_shift_request_approval();
revoke all on function private.check_shift_request_approval() from public,anon,authenticated;


-- Keep historical branch assignments even when the visible coverage badge is removed.
create function public.merge_employees_with_coverage(primary_id text, duplicate_id text, requested_name text, requested_branch text, requested_coverage boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if private.account_role() is distinct from 'admin' or requested_coverage is null then
    raise exception 'Admin and coverage choice required' using errcode='42501';
  end if;
  perform public.merge_employees(primary_id, duplicate_id, requested_name, requested_branch);
  update public.profiles set data=jsonb_set(data,'{isCoverage}',to_jsonb(requested_coverage)) where id=primary_id;
end $$;
revoke all on function public.merge_employees_with_coverage(text,text,text,text,boolean) from public,anon;
grant execute on function public.merge_employees_with_coverage(text,text,text,text,boolean) to authenticated;

update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
