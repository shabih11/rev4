begin;
-- All active members may read reviews and shifts across branches, as requested.
-- Notes, account details and all write policies retain their existing boundaries.
alter policy reviews_read on public.reviews using ((select private.account_role()) is not null);
alter policy timeline_read on public.timeline_events using (
 ((select private.account_role()) is not null and kind='shift') or
 (select private.account_role())='admin' or
 (branch=(select private.account_branch()) and (select private.account_role())='manager') or
 ((select private.account_profile())=any(employee_ids) and (select private.account_role())='employee')
);
-- Reject cached empty detail results created under the former read policy.
update public.app_state set version=txid_current(),changed_at=clock_timestamp() where id=1;
commit;
