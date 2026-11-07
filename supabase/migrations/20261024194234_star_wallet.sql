-- Full qualifying stars are purchase currency; ranking data is unchanged.
create or replace function private.avatar_wallet(profile text) returns jsonb
language sql stable security definer set search_path='' as $$
 with earnings as (
   select coalesce(sum(rating),0) total from public.reviews
   where rating between 3 and 5 and profile=any(employee_ids) and occurred_at<=now()
 ), spending as (
   select coalesce(sum(price_paid),0) total from public.avatar_purchases where profile_id=profile
 )
 select jsonb_build_object('earned',e.total,'spent',s.total,'available',greatest(0,e.total-s.total))
 from earnings e cross join spending s;
$$;
revoke all on function private.avatar_wallet(text) from public,anon,authenticated;
-- Invalidate cached feature and wallet responses.
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
