begin;
-- Production may predate the branch reward infrastructure. Install only the
-- milestone prerequisites there; newer databases retain their progression rules.
do $bootstrap$
begin
 if to_regclass('private.branch_badge_rewards') is null then
  create table private.branch_badge_rewards (
   branch text not null references public.branches(id),
   badge text not null check (badge in ('milestone','milestone500')),
   period date not null,
   approved_at timestamptz not null default clock_timestamp(),
   primary key(branch,badge,period)
  );
  alter table private.branch_badge_rewards enable row level security;
  revoke all on private.branch_badge_rewards from public,anon,authenticated;
  create table private.branch_badge_reward_recipients (
   branch text not null, badge text not null, period date not null,
   profile_id text not null references public.profiles(id),
   approved_at timestamptz not null default clock_timestamp(),
   primary key(branch,badge,period,profile_id),
   foreign key(branch,badge,period) references private.branch_badge_rewards(branch,badge,period)
  );
  alter table private.branch_badge_reward_recipients enable row level security;
  revoke all on private.branch_badge_reward_recipients from public,anon,authenticated;
  create trigger branch_badge_reward_version after insert on private.branch_badge_rewards
   for each statement execute function private.bump_version();
  create trigger branch_badge_recipient_version after insert on private.branch_badge_reward_recipients
   for each statement execute function private.bump_version();

  alter function private.employee_progression(text,date) rename to progression_before_manual_milestones;
  execute $definition$
   create function private.employee_progression(profile text, cutoff date default (now() at time zone 'Asia/Riyadh')::date)
   returns jsonb language sql stable security definer set search_path='' as $body$
    select legacy || jsonb_build_object('coins',coalesce((legacy->>'coins')::numeric,0)+(
     select coalesce(sum(case badge when 'milestone' then 10000 else 1000 end),0)
     from private.branch_badge_reward_recipients
     where profile_id=profile and approved_at<(cutoff+1)::timestamp at time zone 'Asia/Riyadh'
    )) from (select private.progression_before_manual_milestones(profile,cutoff) legacy) prior;
   $body$;
  $definition$;
  revoke all on function private.employee_progression(text,date) from public,anon,authenticated;
  alter function public.get_read_model() rename to read_model_before_manual_milestones;
  alter function public.read_model_before_manual_milestones() set schema private;
  revoke all on function private.read_model_before_manual_milestones() from public,anon,authenticated;
  execute $definition$
   create function public.get_read_model() returns jsonb
   language sql stable security definer set search_path='' as $body$
    select private.read_model_before_manual_milestones() || jsonb_build_object('branchBadgeRewards',(
     select coalesce(jsonb_agg(jsonb_build_object('branch',branch,'badge',badge,'period',period) order by branch,badge,period),'[]'::jsonb)
     from private.branch_badge_rewards
    ));
   $body$;
  $definition$;
  revoke all on function public.get_read_model() from public,anon;
  grant execute on function public.get_read_model() to authenticated;
 end if;
end $bootstrap$;

create or replace function public.approve_branch_badge_reward(requested_branch text, requested_badge text, requested_employee_ids text[]) returns void
language plpgsql security definer set search_path='' as $$
declare award_period date;
begin
 if auth.uid() is null or private.account_role() is distinct from 'admin' then raise insufficient_privilege; end if;
 if requested_badge is null or requested_badge not in ('milestone','milestone500')
 or requested_employee_ids is null or cardinality(requested_employee_ids) not between 1 and 1000 then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended('rev4-write-rows',0));
 if (select count(*) from public.profiles p where p.id=any(requested_employee_ids)
   and p.data->>'role'='employee' and p.data->>'branch'=requested_branch)<>cardinality(requested_employee_ids)
 then raise invalid_parameter_value; end if;
 -- Milestones are granted exclusively by the administrator's explicit selection.
 select b.period into award_period from private.branch_badge_rewards b
 where b.branch=requested_branch and b.badge=requested_badge order by b.approved_at limit 1;
 if award_period is null then
  award_period:=date '2026-11-01';
  insert into private.branch_badge_rewards(branch,badge,period) values(requested_branch,requested_badge,award_period);
 end if;
 insert into private.branch_badge_reward_recipients(branch,badge,period,profile_id)
 select requested_branch,requested_badge,award_period,id from unnest(requested_employee_ids) id
 on conflict do nothing;
end $$;
revoke all on function public.approve_branch_badge_reward(text,text,text[]) from public,anon;
grant execute on function public.approve_branch_badge_reward(text,text,text[]) to authenticated;

commit;
