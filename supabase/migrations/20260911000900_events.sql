-- Raw analytics events: daily partitions, 14-day retention on Supabase Free.
create table analytics.events (
  id bigint generated always as identity,
  ts timestamptz not null default now(),
  client_ts timestamptz,
  game_id uuid not null,
  version_id uuid,
  player_id uuid not null,
  user_id uuid,
  session_id uuid not null,
  run_id uuid,
  name text not null,
  level text,
  outcome text,
  score bigint,
  value double precision,
  props jsonb not null default '{}'::jsonb,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  os text,
  browser text,
  country char(2),
  primary key (ts, id)
) partition by range (ts);

create index events_game_ts_idx on analytics.events (game_id, ts desc);
create index events_player_ts_idx on analytics.events (player_id, ts);
create index events_session_idx on analytics.events (session_id);
create index events_run_idx on analytics.events (run_id) where run_id is not null;

select partman.create_parent(
  p_parent_table    := 'analytics.events',
  p_control         := 'ts',
  p_interval        := '1 day',
  p_type            := 'range',
  p_premake         := 3,
  p_start_partition := (date_trunc('day', now()) - interval '1 day')::text,
  p_default_table   := true
);

update partman.part_config
   set retention = '14 days',
       retention_keep_table = false,
       retention_keep_index = false,
       infinite_time_partitions = true,
       inherit_privileges = true
 where parent_table = 'analytics.events';

select cron.schedule('partman_maintenance', '7 * * * *', $$select partman.run_maintenance(p_analyze := false)$$);
select cron.schedule('cron_history_gc', '0 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
