-- Keep already-open clients functional during the store rollout.
begin;
create or replace function public.get_employee_features() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.account_role() is null then raise exception 'Membership required' using errcode='42501'; end if;
 -- Reconstruct yesterday from today's records, including historical imports and current manual adjustments.
 select jsonb_build_object('settings',s.data,'baselineDay',(now() at time zone 'Asia/Riyadh')::date,
 'comparisonSource',case when b.day is null then 'records' else 'snapshot' end,
 'baseline',coalesce(b.balances,(select coalesce(jsonb_object_agg(profile_id,balance),'{}') from private.employee_scores(((now() at time zone 'Asia/Riyadh')::date)::timestamp at time zone 'Asia/Riyadh'))),
 'accessories','{}'::jsonb,'store',public.get_avatar_store()) into result from public.employee_feature_settings s left join private.employee_daily_baselines b on b.day=(now() at time zone 'Asia/Riyadh')::date where s.id=1;
 return result;
end $$;

update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
