begin;
-- Extend read access only; preserve the existing real/scheduled presence projection.
do $migration$
declare definition text; guard text := $$private.account_role() is distinct from 'employee'$$;
begin
 definition:=pg_get_functiondef('public.get_online_employees()'::regprocedure);
 if strpos(definition,guard)=0 then raise exception 'Presence role guard not found'; end if;
 execute replace(definition,guard,$$coalesce(private.account_role(),'') not in ('employee','admin')$$);
end $migration$;
revoke all on function public.get_online_employees() from public,anon;
grant execute on function public.get_online_employees() to authenticated;
commit;
