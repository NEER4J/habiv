-- Scheduling and partitioning extensions (both ship with Supabase Free).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists partman;
create extension if not exists pg_partman with schema partman;
grant usage on schema partman to postgres;

-- Private schema for high-volume, service-role-only data. Not exposed by the API, so
-- partitions created later can never leak through PostgREST.
create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

-- Versions can be archived by the nightly prune job (row kept, bundle removed).
alter table public.game_versions drop constraint if exists game_versions_status_check;
alter table public.game_versions
  add constraint game_versions_status_check check (status in ('uploaded','processing','ready','rejected','archived'));
