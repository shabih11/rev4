-- Fresh application data. No Firebase data or experimental identities are imported.
begin;
drop view if exists public.shifts;
drop table if exists public.note_signals, public.review_signals, public.user_access,
  public.timeline_events, public.reviews, public.profiles, public.branches cascade;
create schema if not exists private;
revoke all on schema private from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create function private.record_day(value text) returns date
language plpgsql immutable set search_path = '' as $$
declare parts text[]; result date;
begin
  if value ~ '^\d{4}-\d{2}-\d{2}$' then
    parts := string_to_array(value, '-');
    result := make_date(parts[1]::int, parts[2]::int, parts[3]::int);
  elsif value ~ '^\d{2}-\d{2}-\d{4}$' then
    parts := string_to_array(value, '-');
    result := make_date(parts[3]::int, parts[2]::int, parts[1]::int);
  else raise exception 'Invalid record date' using errcode = '22007'; end if;
  return result;
end $$;
create function private.record_at(day text, clock text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  if clock is null or clock !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid record time' using errcode = '22007';
  end if;
  return (private.record_day(day) + clock::time) at time zone 'Etc/GMT-3';
end $$;
create function private.record_end(value jsonb) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare result timestamptz;
begin
  if value->>'type'<>'shift' then return null; end if;
  result:=private.record_at(coalesce(value->>'endDate',value->>'date'),value->>'endTime');
  if value->>'endDate' is null and result<=private.record_at(value->>'date',value->>'time') then result:=result+interval '1 day'; end if;
  return result;
end $$;
create function private.member_ids(value jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(e->>'id' order by e->>'id'), '{}')
  from jsonb_array_elements(coalesce(value, '[]')) e;
$$;

create table public.branches (
  id text primary key, data jsonb not null,
  check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  check (data ?& array['id','name','start','end','nextDayTime'])
);
create table public.profiles (
  id text primary key, data jsonb not null,
  branch text generated always as (data->>'branch') stored,
  check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  check (length(coalesce(data->>'name','')) between 1 and 120),
  check (data ?& array['id','name','branch','role']),
  check (coalesce(data->>'role','') in ('admin','manager','employee')),
  check (not data ?| array['email','password','mustChangePassword'])
);
create table public.user_access (
  uid uuid primary key references auth.users(id) on delete cascade,
  profile_id text not null unique references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','manager','employee')),
  branch text references public.branches(id),
  disabled boolean not null default false,
  check (role = 'admin' or branch is not null)
);
create table public.reviews (
  id text primary key, data jsonb not null,
  branch text generated always as (data->>'branch') stored references public.branches(id),
  rating smallint generated always as ((data->>'rating')::smallint) stored not null check (rating between 1 and 5),
  occurred_at timestamptz generated always as (private.record_at(data->>'date',data->>'time')) stored not null,
  employee_ids text[] not null default '{}',
  check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  check (data ?& array['branch','rating','date','time','linkedEmployeeIds'])
);
create table public.timeline_events (
  id text primary key, data jsonb not null,
  branch text generated always as (data->>'branch') stored references public.branches(id),
  kind text generated always as (data->>'type') stored not null check (kind in ('shift','gap','review')),
  occurred_at timestamptz generated always as (private.record_at(data->>'date',data->>'time')) stored not null,
  ends_at timestamptz generated always as (private.record_end(data)) stored,
  employee_ids text[] not null default '{}',
  check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  check (data ?& array['branch','type','title','date','time'])
);
create table public.app_state (
  id smallint primary key check (id=1), version bigint not null,
  changed_at timestamptz not null default clock_timestamp()
);
insert into public.app_state(id,version) values(1,txid_current());
create index reviews_branch_time on public.reviews(branch,occurred_at);
create index reviews_members on public.reviews using gin(employee_ids);
create index timeline_branch_time on public.timeline_events(branch,occurred_at);
create index timeline_members on public.timeline_events using gin(employee_ids);
create index profiles_branch on public.profiles(branch);
create index user_access_branch on public.user_access(branch);

create function private.account_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.user_access where uid=(select auth.uid()) and not disabled;
$$;
create function private.account_branch() returns text
language sql stable security definer set search_path = '' as $$
  select branch from public.user_access where uid=(select auth.uid()) and not disabled;
$$;
create function private.account_profile() returns text
language sql stable security definer set search_path = '' as $$
  select profile_id from public.user_access where uid=(select auth.uid()) and not disabled;
$$;
create function private.bump_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.app_state set version=txid_current(),changed_at=clock_timestamp()
    where id=1 and version<>txid_current();
  return null;
end $$;

create function private.validate_record() returns trigger
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
    if tg_op='INSERT' then
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

do $$ declare tab text; begin
  foreach tab in array array['branches','profiles','user_access','reviews','timeline_events','app_state'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public, anon, authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
  foreach tab in array array['branches','profiles','reviews','timeline_events'] loop
    execute format('grant insert, update, delete on public.%I to authenticated',tab);
    execute format('create trigger validate_record before insert or update or delete on public.%I for each row execute function private.validate_record()',tab);
    execute format('create trigger data_version after insert or update or delete on public.%I for each statement execute function private.bump_version()',tab);
  end loop;
  create trigger access_version after insert or update or delete on public.user_access for each statement execute function private.bump_version();
end $$;

create policy branches_read on public.branches for select to authenticated using ((select private.account_role()) is not null);
create policy branches_write on public.branches for all to authenticated using ((select private.account_role())='admin') with check ((select private.account_role())='admin');
create policy profiles_read on public.profiles for select to authenticated using ((select private.account_role()) is not null);
create policy profiles_admin on public.profiles for all to authenticated using ((select private.account_role())='admin') with check ((select private.account_role())='admin');
create policy profiles_self on public.profiles for update to authenticated using (id=(select private.account_profile())) with check (id=(select private.account_profile()));
create policy access_read on public.user_access for select to authenticated using (uid=(select auth.uid()) or (select private.account_role())='admin');
create policy state_read on public.app_state for select to authenticated using ((select private.account_role()) is not null);
create policy reviews_read on public.reviews for select to authenticated using (
  (select private.account_role())='admin' or (branch=(select private.account_branch()) and (select private.account_role())='manager') or
  ((select private.account_profile())=any(employee_ids) and (select private.account_role())='employee'));
create policy reviews_admin on public.reviews for all to authenticated using ((select private.account_role())='admin') with check ((select private.account_role())='admin');
create policy reviews_link on public.reviews for update to authenticated using ((select private.account_role())='manager' and branch=(select private.account_branch())) with check ((select private.account_role())='manager' and branch=(select private.account_branch()));
create policy timeline_read on public.timeline_events for select to authenticated using (
  (select private.account_role())='admin' or (branch=(select private.account_branch()) and (select private.account_role())='manager') or
  ((select private.account_profile())=any(employee_ids) and (select private.account_role())='employee'));
create policy timeline_admin on public.timeline_events for all to authenticated using ((select private.account_role())='admin') with check ((select private.account_role())='admin');
create policy timeline_manager on public.timeline_events for all to authenticated using ((select private.account_role())='manager' and branch=(select private.account_branch()) and kind<>'review') with check ((select private.account_role())='manager' and branch=(select private.account_branch()) and kind<>'review');
create policy timeline_employee_note on public.timeline_events for insert to authenticated with check ((select private.account_role())='employee' and branch=(select private.account_branch()) and kind='gap');

create function public.get_my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.data || jsonb_build_object('email',u.email,'role',a.role,'branch',coalesce(a.branch,''))
  from public.user_access a join public.profiles p on p.id=a.profile_id join auth.users u on u.id=a.uid
  where a.uid=(select auth.uid()) and not a.disabled;
$$;
create function public.get_accounts() returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.account_role() is distinct from 'admin' or auth.uid() is null then raise exception 'Admin required' using errcode='42501'; end if;
  return query select p.data || jsonb_build_object('email',coalesce(u.email,'')) from public.profiles p
    left join public.user_access a on a.profile_id=p.id left join auth.users u on u.id=a.uid;
end $$;
create function public.get_read_model() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if private.account_role() is null or auth.uid() is null then raise exception 'Membership required' using errcode='42501'; end if;
  select jsonb_build_object('generatedAt',s.changed_at,'directory',(select coalesce(jsonb_agg(data order by id),'[]') from public.profiles),
    'reviews',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'branch',branch,'rating',data->>'rating','date',data->>'date','time',data->>'time','linkedEmployeeIds',data->'linkedEmployeeIds') order by id),'[]') from public.reviews),
    'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'branch',branch,'type','gap','date',data->>'date','title',case when data->>'title' like '%شكوى%' then 'شكوى' when data->>'title' like '%سلامة%' then 'سلامة' else '' end,'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',x,'name','')),'[]') from unnest(employee_ids) x))),'[]') from public.timeline_events where kind='gap'),
    'hours',(select coalesce(jsonb_object_agg(employee,hours),'{}') from
      (select e employee,sum(extract(epoch from (t.ends_at-t.occurred_at))/3600) hours from public.timeline_events t cross join lateral unnest(t.employee_ids) e where t.kind='shift' group by e) totals)) into result from public.app_state s where id=1;
  return result;
end $$;

create function public.read_rows(source text, requested_branches text[] default '{}', requested_employees text[] default '{}', all_rows boolean default false) returns setof jsonb
language plpgsql stable set search_path = '' as $$
declare tab text;
begin
  tab:=case source when 'profiles' then 'profiles' when 'reviews' then 'reviews' when 'timeline' then 'timeline_events' when 'branches' then 'branches' else null end;
  if tab is null or cardinality(requested_branches)+cardinality(requested_employees)>30 then raise exception 'Invalid read scope'; end if;
  if tab='branches' then return query select data from public.branches where all_rows or id=any(requested_branches) order by id;
  elsif tab='profiles' then return query select data from public.profiles where all_rows or branch=any(requested_branches) order by id;
  else return query execute format('select data from public.%I where $1 or branch=any($2) or employee_ids&&$3 order by id',tab) using all_rows,requested_branches,requested_employees; end if;
end $$;

create function private.sync_review_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare entry jsonb;
begin
  if tg_op='DELETE' then delete from public.timeline_events where id=old.id and kind='review'; return old; end if;
  if exists(select 1 from public.timeline_events where id=new.id and kind<>'review') then raise exception 'Record identity collision'; end if;
  entry:=jsonb_build_object('id',new.id,'branch',new.data->>'branch','type','review','title','تقييم Windsor ('||(new.data->>'rating')||')',
    'date',new.data->>'date','time',new.data->>'time','comment',coalesce(new.data->>'comment',''),'reviewId',new.id,
    'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.data->>'name') order by p.id),'[]') from public.profiles p where p.id=any(new.employee_ids)));
  if new.data ? 'batchId' then entry:=entry||jsonb_build_object('batchId',new.data->>'batchId'); end if;
  insert into public.timeline_events(id,data) values(new.id,entry) on conflict(id) do update set data=excluded.data where timeline_events.data is distinct from excluded.data;
  return new;
end $$;
create function private.relink_shift_reviews() returns trigger
language plpgsql security definer set search_path = '' as $$
declare affected text;
begin
  if tg_op='DELETE' then if old.kind<>'shift' then return old; end if; affected:=old.branch;
  else if new.kind<>'shift' and (tg_op='INSERT' or old.kind<>'shift') then return new; end if; affected:=new.branch; end if;
  -- The shift and all review assignments commit together; boundaries are [start,end).
  update public.reviews r set data=(r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=s.occurred_at and r.occurred_at<s.ends_at),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb))
  where r.branch=affected and r.data is distinct from ((r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=s.occurred_at and r.occurred_at<s.ends_at),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb)));
  return coalesce(new,old);
end $$;
create trigger review_event after insert or update or delete on public.reviews for each row execute function private.sync_review_event();
create trigger shift_assignments after insert or update or delete on public.timeline_events for each row execute function private.relink_shift_reviews();

create function public.write_rows(source text, changes jsonb) returns void
language plpgsql set search_path = '' as $$
declare tab text; item jsonb; actual jsonb; wanted jsonb; expected jsonb; identifier text;
begin
  tab:=case source when 'users' then 'profiles' when 'reviews' then 'reviews' when 'timeline' then 'timeline_events' when 'branches' then 'branches' else null end;
  if private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
  if tab is null or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>1500 then raise exception 'Invalid write request'; end if;
  -- Serialize UI saves so an absent row cannot race another concurrent insert.
  perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
  for item in select value from jsonb_array_elements(changes) order by value->>'id' loop
    identifier:=item->>'id'; expected:=nullif(item->'before','null'::jsonb); wanted:=nullif(item->'after','null'::jsonb);
    if source='users' then expected:=expected-array['email','password','mustChangePassword']; wanted:=wanted-array['email','password','mustChangePassword']; end if;
    execute format('select data from public.%I where id=$1 for update',tab) into actual using identifier;
    if actual is distinct from expected then raise exception 'write-conflict' using errcode='40001'; end if;
    if wanted is null then execute format('delete from public.%I where id=$1',tab) using identifier;
    elsif actual is null then execute format('insert into public.%I(id,data) values($1,$2)',tab) using identifier,wanted;
    else execute format('update public.%I set data=$2 where id=$1',tab) using identifier,wanted; end if;
  end loop;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.account_role(),private.account_branch(),private.account_profile(),private.record_day(text),private.record_at(text,text),private.record_end(jsonb),private.member_ids(jsonb) to authenticated,service_role;
revoke all on function public.get_my_account(),public.get_accounts(),public.get_read_model(),public.read_rows(text,text[],text[],boolean),public.write_rows(text,jsonb) from public,anon;
grant execute on function public.get_my_account(),public.get_accounts(),public.get_read_model(),public.read_rows(text,text[],text[],boolean),public.write_rows(text,jsonb) to authenticated;
insert into public.branches(id,data) select name,jsonb_build_object('id',name,'name',name,'start','16:00','end',opening,'nextDayTime',opening,'googleApi',location) from (values
  ('جاليري','14:00','locations/3108762223721282674'),('القصر','14:00','locations/5313787192350057859'),
  ('المملكة','10:00','locations/3102684010058296265'),('شرق','07:00','locations/16510748030849104251'),
  ('ذافيو','12:00','locations/10045625494363697870'),('سلام','10:00','locations/9902225787849509285')) b(name,opening,location);
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.app_state, public.user_access;
  end if;
end $$;
commit;
