begin;
create function public.rename_me(new_name text, previous_name text) returns void
language plpgsql set search_path = '' as $$
declare profile text := private.account_profile(); actual text;
begin
 if profile is null or length(trim(new_name)) not between 1 and 120 then raise exception 'Invalid profile edit' using errcode='42501'; end if;
 select data->>'name' into actual from public.profiles where id=profile for update;
 if actual is distinct from previous_name then raise exception 'write-conflict' using errcode='40001'; end if;
 update public.profiles set data=jsonb_set(data,'{name}',to_jsonb(trim(new_name))) where id=profile;
end $$;
create function public.merge_employees(primary_id text, duplicate_id text, requested_name text, requested_branch text) returns void
language plpgsql security definer set search_path = '' as $$
declare first_profile jsonb; second_profile jsonb; aliases jsonb; branches jsonb; manual jsonb;
begin
 if private.account_role() is distinct from 'admin' or auth.uid() is null then raise exception 'Admin required' using errcode='42501'; end if;
 if primary_id=duplicate_id then raise exception 'Different identities required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 perform 1 from public.profiles where id in (primary_id,duplicate_id) order by id for update;
 select data into first_profile from public.profiles where id=primary_id;
 select data into second_profile from public.profiles where id=duplicate_id;
 if first_profile is null or second_profile is null or first_profile->>'role'<>'employee' or second_profile->>'role'<>'employee' or exists(select 1 from public.user_access where profile_id in (primary_id,duplicate_id) and role<>'employee') then raise exception 'Employee identities required'; end if;
 if length(trim(requested_name)) not between 1 and 120 or not (requested_branch='موظفة خارجية' or exists(select 1 from public.branches where id=requested_branch)) then raise exception 'Invalid merged profile'; end if;
 select coalesce(jsonb_agg(x order by x),'[]') into aliases from
  (select distinct value x from jsonb_array_elements_text(coalesce(first_profile->'aliases','[]')||coalesce(second_profile->'aliases','[]')||jsonb_build_array(first_profile->>'name',second_profile->>'name')) where value<>trim(requested_name)) a;
 select coalesce(jsonb_agg(x order by x),'[]') into branches from
  (select distinct value x from jsonb_array_elements_text(coalesce(first_profile->'assignedBranches','[]')||coalesce(second_profile->'assignedBranches','[]')||jsonb_build_array(first_profile->>'branch',second_profile->>'branch')) where value<>'موظفة خارجية' and value<>'') b;
 select jsonb_object_agg(k,coalesce((first_profile#>>array['manualStats',k])::numeric,0)+coalesce((second_profile#>>array['manualStats',k])::numeric,0)) into manual from unnest(array['positive','negative','complaints','safety','totalReviews','monthReviews']) k;
 update public.profiles set data=data||jsonb_build_object('name',trim(requested_name),'branch',requested_branch,'aliases',aliases,'assignedBranches',branches,'manualStats',manual) where id=primary_id;
 update public.timeline_events t set data=jsonb_set(t.data,'{employees}',(select jsonb_agg(jsonb_build_object('id',member,'name',case when member=primary_id then trim(requested_name) else (select data->>'name' from public.profiles where id=member) end) order by member) from (select distinct case when x=duplicate_id then primary_id else x end member from unnest(t.employee_ids) x) members)) where t.kind<>'review' and duplicate_id=any(t.employee_ids);
 update public.reviews r set data=jsonb_set(r.data,'{linkedEmployeeIds}',(select jsonb_agg(member order by member) from (select distinct case when x=duplicate_id then primary_id else x end member from unnest(r.employee_ids) x) members)) where duplicate_id=any(r.employee_ids);
 update public.user_access set branch=requested_branch where profile_id=primary_id and requested_branch<>'موظفة خارجية';
 delete from public.profiles where id=duplicate_id;
end $$;
revoke all on function public.rename_me(text,text),public.merge_employees(text,text,text,text) from public,anon;
grant execute on function public.rename_me(text,text),public.merge_employees(text,text,text,text) to authenticated;
create or replace function private.relink_shift_reviews() returns trigger
language plpgsql security definer set search_path = '' as $$
declare affected text[];
begin
  if tg_op='DELETE' then if old.kind<>'shift' then return old; end if; affected:=array[old.branch];
  else if new.kind<>'shift' and (tg_op='INSERT' or old.kind<>'shift') then return new; end if; affected:=case when tg_op='UPDATE' then array[old.branch,new.branch] else array[new.branch] end; end if;
  -- The shift and all review assignments commit together; boundaries are [start,end).
  update public.reviews r set data=(r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=s.occurred_at and r.occurred_at<s.ends_at),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb))
  where r.branch=any(affected) and r.data is distinct from ((r.data-'linkedShiftId')||coalesce(
    (select jsonb_build_object('linkedShiftId',s.id,'linkedEmployeeIds',to_jsonb(s.employee_ids)) from public.timeline_events s
      where s.kind='shift' and s.branch=r.branch and r.occurred_at>=s.occurred_at and r.occurred_at<s.ends_at),
    jsonb_build_object('linkedEmployeeIds','[]'::jsonb)));
  return coalesce(new,old);
end $$;
commit;
