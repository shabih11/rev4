-- Reports are deliberately excluded from the shared employee read model.
create table public.result_problem_reports (
  id uuid primary key,
  reporter_uid uuid not null default auth.uid() references auth.users(id),
  reporter_profile_id text not null default private.account_profile(),
  category text not null check (category in ('appeal','manipulation','verify_employee')),
  target_employee_id text,
  description text not null check (char_length(description) between 1 and 70 and description !~ '^\s*$'),
  results_period date not null check (extract(day from results_period)=1),
  created_at timestamptz not null default now(),
  check ((category='verify_employee' and target_employee_id is not null) or
         (category<>'verify_employee' and target_employee_id is null))
);
alter table public.result_problem_reports enable row level security;
revoke all on public.result_problem_reports from public, anon, authenticated;
grant insert(id,category,target_employee_id,description,results_period) on public.result_problem_reports to authenticated;
grant select on public.result_problem_reports to authenticated;
create policy submit_result_problem on public.result_problem_reports for insert to authenticated
with check (
  reporter_uid=(select auth.uid()) and
  reporter_profile_id=(select private.account_profile()) and
  (select private.account_role()) in ('employee','manager','admin') and
  (target_employee_id is null or (
    target_employee_id<>(select private.account_profile()) and
    exists(select 1 from public.profiles p where p.id=target_employee_id and p.data->>'role'='employee')
  ))
);
create policy admin_read_result_problems on public.result_problem_reports for select to authenticated
using ((select private.account_role())='admin');
create index result_problem_reports_created on public.result_problem_reports(created_at desc);
