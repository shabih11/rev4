-- Synthetic fixtures only; all changes are rolled back.
begin;
insert into public.profiles(id,data) select id,jsonb_build_object('id',id,'name','Verification','role',role,'branch',branch) from (values ('shared-manager','manager','جاليري'),('shared-employee','employee','جاليري'),('shared-other','employee','شرق')) f(id,role,branch);
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','shared-manager@example.invalid'),('10000000-0000-4000-8000-000000000002','shared-employee@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values ('10000000-0000-4000-8000-000000000001','shared-manager','manager','جاليري'),('10000000-0000-4000-8000-000000000002','shared-employee','employee','جاليري');
insert into public.reviews(id,data) values ('shared-review','{"id":"shared-review","branch":"شرق","rating":"5","date":"21-10-2026","time":"14:00","linkedEmployeeIds":[]}');
insert into public.timeline_events(id,data) values
 ('shared-shift','{"id":"shared-shift","branch":"شرق","type":"shift","title":"Verification","date":"21-10-2026","time":"13:00","endTime":"15:00","employees":[{"id":"shared-other","name":"Verification"}]}'),
 ('shared-note','{"id":"shared-note","branch":"شرق","type":"gap","title":"Private note","date":"21-10-2026","time":"13:00","employees":[{"id":"shared-other","name":"Verification"}]}');
set local role authenticated;
do $$ declare uid text; touched integer; begin
 foreach uid in array array['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  if not exists(select 1 from public.reviews where id='shared-review') then raise exception 'Cross-branch review unavailable'; end if;
  if not exists(select 1 from public.timeline_events where id='shared-shift') then raise exception 'Cross-branch shift unavailable'; end if;
  if (select count(*) from public.read_rows('timeline','{}',array['shared-other'],false))<>1 then raise exception 'Selected employee scope unavailable'; end if;
  if exists(select 1 from public.timeline_events where id='shared-note') then raise exception 'Private note leaked'; end if;
  update public.timeline_events set data=data||'{"title":"Unauthorized"}'::jsonb where id='shared-shift'; get diagnostics touched=row_count;
  if touched<>0 then raise exception 'Shared read granted shift write'; end if;
  update public.reviews set data=data||'{"comment":"Unauthorized"}'::jsonb where id='shared-review'; get diagnostics touched=row_count;
  if touched<>0 then raise exception 'Shared read granted review write'; end if;
  begin perform public.get_accounts(); raise exception 'Account details leaked'; exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
 if exists(select 1 from public.reviews where id='shared-review') or exists(select 1 from public.timeline_events where id='shared-shift') then raise exception 'Missing membership granted read'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.reviews limit 1; raise exception 'Anonymous review read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Shared reads, scoped writes, note privacy and anonymous denial verified' as verification;
rollback;
