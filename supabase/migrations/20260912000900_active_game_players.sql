-- Keep a short-lived heartbeat on open runs so the game page can show how many distinct
-- players are currently playing. A run can stay open when a tab crashes, so the count
-- treats a player as active only when its heartbeat is recent.

alter table analytics.runs
  add column if not exists last_seen_at timestamptz not null default now();

-- Do not make old orphaned runs look active when this column is added.
update analytics.runs
   set last_seen_at = started_at
 where last_seen_at > started_at;

create index if not exists runs_active_game_idx
  on analytics.runs (game_id, last_seen_at desc)
 where ended_at is null and preview = false;

create or replace function public.heartbeat_run(p_id uuid)
returns boolean
language sql
security definer
set search_path = public, analytics
as $$
  update analytics.runs
     set last_seen_at = now()
   where id = p_id
     and ended_at is null
     and preview = false
  returning true;
$$;
revoke execute on function public.heartbeat_run(uuid) from public, anon, authenticated;

create or replace function public.active_game_players(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, analytics
as $$
  select count(distinct r.player_id)::int
    from analytics.runs r
    join public.games g on g.id = r.game_id
   where r.game_id = p_game_id
     and g.status = 'published'
     and r.preview = false
     and r.ended_at is null
     and r.last_seen_at > now() - interval '75 seconds';
$$;
grant execute on function public.active_game_players(uuid) to anon, authenticated;

-- Heartbeats keep a genuinely long game alive; only expire a run after the player has gone
-- quiet, rather than after a fixed amount of time since it started.
create or replace function public.rollup_5m()
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  update analytics.runs
     set ended_at = started_at + interval '10 minutes', outcome = 'quit', duration_ms = 600000, flagged = coalesce(flagged, 'expired')
   where ended_at is null and coalesce(last_seen_at, started_at) < now() - interval '30 minutes';

  insert into public.game_stats_5m (game_id, bucket, plays, uniques, runs_ended, completions)
  select game_id,
         to_timestamp(floor(extract(epoch from started_at) / 300) * 300) as bucket,
         count(*),
         count(distinct player_id),
         count(*) filter (where ended_at is not null),
         count(*) filter (where outcome = 'complete')
    from analytics.runs
   where started_at >= now() - interval '10 minutes' and preview = false
   group by 1, 2
  on conflict (game_id, bucket) do update
    set plays = excluded.plays, uniques = excluded.uniques, runs_ended = excluded.runs_ended, completions = excluded.completions;

  insert into analytics.player_first_seen (game_id, player_id, first_day)
  select game_id, player_id, min(started_at at time zone 'utc')::date
    from analytics.runs
   where started_at >= now() - interval '10 minutes' and preview = false
   group by 1, 2
  on conflict do nothing;

  update public.game_stats s
     set runs = agg.runs_ended,
         completions = agg.completions,
         unique_players = (select count(*) from analytics.player_first_seen f where f.game_id = s.game_id),
         updated_at = now()
    from (select game_id, sum(runs_ended) runs_ended, sum(completions) completions
            from public.game_stats_5m group by game_id) agg
   where agg.game_id = s.game_id
     and s.game_id in (select distinct game_id from analytics.runs where started_at >= now() - interval '10 minutes');
end
$$;
revoke execute on function public.rollup_5m() from public, anon, authenticated;
