-- Private, append-only telemetry. No arbitrary metadata, text, URL, email or IP.
create table private.usage_events (
 id uuid primary key, user_id uuid not null, profile_id text not null, branch text,
 session_id uuid not null, kind text not null check(kind in ('session_start','session_end','page_view','active','click')),
 page text not null check(page in ('leaderboard','dashboard','avatar','profile','employees','shifts','branches','notes','stats','features','avatars','analytics')),
 seconds integer not null check(seconds between 0 and 15),
 action text not null check(action in ('','navigation','open_details','submit_request','purchase','equip','logout')),
 received_at timestamptz not null default clock_timestamp()
);
create index usage_actor_time on private.usage_events(user_id,received_at);
create index usage_profile_time on private.usage_events(profile_id,received_at);
create index usage_time on private.usage_events(received_at);
alter table private.usage_events enable row level security;
revoke all on private.usage_events from public,anon,authenticated;
create table private.sensitive_audit (
 id bigint generated always as identity primary key, actor uuid, profile_id text, entity text not null,
 operation text not null, recorded_at timestamptz not null default clock_timestamp()
);
create index sensitive_audit_actor_time on private.sensitive_audit(profile_id,recorded_at);
alter table private.sensitive_audit enable row level security;
revoke all on private.sensitive_audit from public,anon,authenticated;
create function private.audit_sensitive_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.sensitive_audit(actor,profile_id,entity,operation)
 values(auth.uid(),private.account_profile(),tg_table_name,tg_op);
 return null;
end $$;
revoke all on function private.audit_sensitive_change() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['user_access','profiles','branches','reviews','timeline_events','employee_deactivations','employee_feature_settings','avatar_collections','avatar_variants','magic_settings','sea_mission_completions','avatar_purchases','avatar_equipped','gem_purchases','gem_equipped'] loop
 execute format('create trigger usage_sensitive_audit after insert or update or delete on public.%I for each row execute function private.audit_sensitive_change()',t);
 end loop;
end $$;
-- Record credential changes without copying any credential or address.
create function private.audit_credential_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email then
 insert into private.sensitive_audit(actor,profile_id,entity,operation)
 values(auth.uid(),private.account_profile(),'credentials','UPDATE');
 end if;
 return null;
end $$;
revoke all on function private.audit_credential_change() from public,anon,authenticated;
create trigger usage_credential_audit after update on auth.users for each row execute function private.audit_credential_change();
create trigger usage_username_audit after insert or update or delete on private.account_usernames for each row execute function private.audit_sensitive_change();
create function public.record_usage_batch(batch jsonb, expected_profile text) returns void language plpgsql security definer set search_path='' as $$
declare a public.user_access; e jsonb; n integer;
begin
 select * into a from public.user_access where uid=auth.uid() and not disabled;
 if a.uid is null or expected_profile is distinct from a.profile_id then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>50 then raise exception 'Invalid batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('usage:'||a.uid::text,0));
 select count(*) into n from private.usage_events where user_id=a.uid and received_at>clock_timestamp()-interval '1 minute';
 if n+jsonb_array_length(batch)>200 then raise exception 'Usage rate exceeded' using errcode='54000'; end if;
 for e in select value from jsonb_array_elements(batch) loop
 if jsonb_typeof(e)<>'object' or e-array['id','session','kind','page','seconds','action']<>'{}'::jsonb or not(e ?& array['id','session','kind','page','seconds','action']) then raise exception 'Invalid event'; end if;
 if (e->>'kind'<>'active' and (e->>'seconds')::int<>0) or (e->>'kind'<>'click' and e->>'action'<>'') then raise exception 'Invalid measurement'; end if;
 insert into private.usage_events(id,user_id,profile_id,branch,session_id,kind,page,seconds,action)
 values((e->>'id')::uuid,a.uid,a.profile_id,a.branch,(e->>'session')::uuid,e->>'kind',e->>'page',(e->>'seconds')::int,e->>'action') on conflict(id) do nothing;
 end loop;
end $$;
create table private.usage_logins (
 id uuid primary key default gen_random_uuid(), user_id uuid, profile_id text, succeeded boolean not null,
 session_id uuid unique, recorded_at timestamptz not null default clock_timestamp()
);
create index usage_login_actor_time on private.usage_logins(user_id,recorded_at);
alter table private.usage_logins enable row level security;
revoke all on private.usage_logins from public,anon,authenticated;
create function public.record_usage_login() returns void language plpgsql security definer set search_path='' as $$
declare a public.user_access; sid uuid := (auth.jwt()->>'session_id')::uuid;
begin
 select * into a from public.user_access where uid=auth.uid() and not disabled;
 if a.uid is null or sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=a.uid) then raise exception 'Session required' using errcode='42501'; end if;
 insert into private.usage_logins(user_id,profile_id,succeeded,session_id,recorded_at) select a.uid,a.profile_id,true,sid,created_at from auth.sessions where id=sid on conflict(session_id) do nothing;
end $$;
revoke all on function public.record_usage_login() from public,anon;
grant execute on function public.record_usage_login() to authenticated;
-- Only the trusted, throttled username login service can report failed attempts.
create function public.record_usage_login_failure(requested_username text) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 insert into private.usage_logins(user_id,profile_id,succeeded)
 select n.uid,a.profile_id,false from private.account_usernames n join public.user_access a on a.uid=n.uid where n.username=lower(trim(requested_username));
end $$;
revoke all on function public.record_usage_login_failure(text) from public,anon,authenticated;
grant execute on function public.record_usage_login_failure(text) to service_role;
create function public.get_usage_report(days integer default 7, target text default null, requested_branch text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; since timestamptz;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 if days not in (7,30,90) then raise exception 'Invalid range'; end if;
 since:=now()-make_interval(days=>days);
 with eligible as (
 select p.id,p.data->>'name' name,p.branch,a.uid,a.disabled from public.profiles p
 left join public.user_access a on a.profile_id=p.id
 where p.data->>'role'='employee' and (requested_branch is null or p.branch=requested_branch)
 ), ev as (
 select e.* from private.usage_events e join eligible p on p.id=e.profile_id
 where e.received_at>=since and (target is null or e.profile_id=target)
 ), employees as (
 select p.id,p.name,p.branch,p.uid is not null has_account,coalesce(p.disabled,false) disabled,
 count(e.id) events,count(distinct e.session_id) sessions,
 count(*) filter(where e.kind='page_view') views,count(*) filter(where e.kind='click') clicks,
 coalesce(sum(e.seconds),0) active_seconds,max(e.received_at) last_seen,
 count(distinct (e.received_at at time zone 'Asia/Riyadh')::date) active_days,
 (select count(*) from private.usage_logins l where l.recorded_at>=since and l.succeeded and l.user_id=p.uid) logins,
 (select count(*) from private.usage_logins l where l.recorded_at>=since and not l.succeeded and l.user_id=p.uid) failed_logins
 from eligible p left join ev e on e.profile_id=p.id where target is null or p.id=target
 group by p.id,p.name,p.branch,p.uid,p.disabled
 ), pages as (
 select page,count(*) filter(where kind='page_view') views,count(distinct profile_id) reached,
 count(distinct profile_id) filter(where kind='click' or seconds>0) engaged,
 coalesce(sum(seconds),0) active_seconds,count(*) filter(where kind='click') clicks from ev group by page
 )
 select jsonb_build_object('employees',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from employees x),'[]'::jsonb),
 'pages',coalesce((select jsonb_agg(to_jsonb(x)) from pages x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select page,kind,action,seconds,received_at,session_id from ev order by received_at desc limit 200) x),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(to_jsonb(x)) from (select session_id,min(received_at) started_at,max(received_at) last_seen,sum(seconds) active_seconds,bool_or(kind='session_end') ended from ev group by session_id order by max(received_at) desc limit 100) x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select entity,operation,recorded_at,profile_id from private.sensitive_audit where recorded_at>=since and (target is null or profile_id=target) order by recorded_at desc limit 100) x),'[]'::jsonb),
 'since',since,'failed_logins_available',true,'comprehension',null) into result;
 return result;
end $$;
revoke all on function public.record_usage_batch(jsonb,text),public.get_usage_report(integer,text,text) from public,anon;
grant execute on function public.record_usage_batch(jsonb,text),public.get_usage_report(integer,text,text) to authenticated;
-- Retain a bounded history; schedule with the existing Supabase cron extension.
create function private.prune_usage() returns void language sql security definer set search_path='' as $$
 delete from private.usage_events where received_at<now()-interval '90 days';
 delete from private.usage_logins where recorded_at<now()-interval '90 days';
 delete from private.sensitive_audit where recorded_at<now()-interval '365 days';
$$;
revoke all on function private.prune_usage() from public,anon,authenticated;

select cron.schedule('rev4-usage-retention','15 2 * * *','select private.prune_usage()');
