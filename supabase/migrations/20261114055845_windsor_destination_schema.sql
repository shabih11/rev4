begin;
-- Windsor checks CREATE TABLE IF NOT EXISTS before every upload. Keep its DDL
-- permission confined to a dedicated, non-API schema, never public.
create schema windsor_ingest;
revoke all on schema windsor_ingest from public,anon,authenticated;
grant usage,create on schema windsor_ingest to windsor_ingest;
grant usage on schema windsor_ingest to service_role;
alter table public.windsor_reviews_inbox set schema windsor_ingest;
commit;
