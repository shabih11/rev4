begin;
-- The monthly-privileges migration already includes this increase on fresh stacks.
-- Preserve per-variant adjustments, publication flags and historical purchase amounts.
do $$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where name='avatar_monthly_privileges') then
  update public.avatar_collections set price=price+1000;
 end if;
end $$;
commit;
