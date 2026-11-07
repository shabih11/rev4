begin;
-- PostgREST 14 retries SQLSTATE 40001 indefinitely. A stale client snapshot is
-- an HTTP 409 conflict, not a transient PostgreSQL serialization failure.
-- Preserve each deployed function's body, permissions and security mode.
do $$
declare routine regprocedure; definition text;
begin
 foreach routine in array array[
  'public.rename_me(text,text)'::regprocedure,
  'public.write_rows(text,jsonb)'::regprocedure,
  'public.transfer_employee(text,text,text,boolean)'::regprocedure,
  'public.save_employee_features(jsonb,jsonb)'::regprocedure,
  'public.save_avatar_collection(uuid,text,numeric,boolean,jsonb)'::regprocedure,
  'public.purchase_avatar(uuid,numeric)'::regprocedure,
  'public.save_magic_settings(jsonb,jsonb)'::regprocedure,
  'public.purchase_mystery_box(uuid,numeric)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(routine);
  if strpos(definition,'''40001''')=0 then
   raise exception 'Expected conflict guard missing in %', routine;
  end if;
  execute replace(definition,'''40001''','''PT409''');
 end loop;
end $$;
commit;
