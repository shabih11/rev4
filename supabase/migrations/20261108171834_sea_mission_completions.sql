-- Mission approvals never create or change Google reviews or employee scores.
create table public.sea_mission_completions (
 branch text not null check (branch in ('جاليري','ذافيو','سلام','القصر','المملكة','شرق')),
 day integer not null check (day between 5 and 30),
 approved_at timestamptz not null default now(),
 approved_by uuid not null default auth.uid() references auth.users(id),
 primary key (branch,day)
);
alter table public.sea_mission_completions enable row level security;
revoke all on public.sea_mission_completions from public,anon,authenticated;
grant select(branch,day,approved_at),insert(branch,day) on public.sea_mission_completions to authenticated;
create policy mission_members_read on public.sea_mission_completions for select to authenticated
 using ((select private.account_role()) is not null);
create policy mission_admin_approve on public.sea_mission_completions for insert to authenticated
 with check (
  (select auth.uid()) is not null and (select private.account_role())='admin'
  and approved_by=(select auth.uid())
  and now() >= ((make_date(2026,11,day) + make_time(
    case when extract(dow from make_date(2026,11,day))=5 then 14
      when branch in ('جاليري','القصر') then 14 when branch='ذافيو' then 12
      when branch in ('المملكة','سلام') then 10 else 7 end,0,0)) at time zone 'Asia/Riyadh')
 );
