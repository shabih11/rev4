-- Optional display/payout rounding, saved through the existing admin-only RPC.
-- Existing clients may omit the flag; omission must preserve its saved value.
create or replace function public.save_employee_features(requested jsonb, expected jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actual jsonb;
begin
  if auth.uid() is null or private.account_role() is distinct from 'admin' then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if requested is null or jsonb_typeof(requested)<>'object' or
    not requested ?& array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt'] or
    requested-array['competition','balanceGrowth','tiers','avatars','silverAt','goldAt','rounding']<>'{}' or
    jsonb_typeof(requested->'silverAt')<>'number' or jsonb_typeof(requested->'goldAt')<>'number' or
    exists(select 1 from unnest(array['competition','balanceGrowth','tiers','avatars']) k where jsonb_typeof(requested->k)<>'boolean') or
    (requested ? 'rounding' and jsonb_typeof(requested->'rounding')<>'boolean') then
    raise exception 'Invalid feature settings' using errcode='22023';
  end if;
  if (requested->>'silverAt')::numeric<=0 or (requested->>'goldAt')::numeric<=(requested->>'silverAt')::numeric or (requested->>'goldAt')::numeric>11 then
    raise exception 'Invalid thresholds' using errcode='22023';
  end if;
  select data into actual from public.employee_feature_settings where id=1 for update;
  if actual is distinct from expected then raise exception 'write-conflict' using errcode='40001'; end if;
  update public.employee_feature_settings
    set data=requested||jsonb_build_object('rounding',coalesce(requested->'rounding',actual->'rounding','false'::jsonb)) where id=1;
end $$;

revoke all on function public.save_employee_features(jsonb,jsonb) from public,anon;
grant execute on function public.save_employee_features(jsonb,jsonb) to authenticated;
