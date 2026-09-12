-- Plays count live: start_run bumps game_stats.plays the moment a run is minted (the Play click),
-- instead of waiting for rollup_5m. rollup_5m no longer rewrites plays, which also stops lifetime
-- plays shrinking when game_stats_5m buckets are pruned after 14 days.

create or replace function public.start_run(
  p_id uuid, p_started_at timestamptz, p_game_id uuid, p_version_id uuid, p_player_id uuid, p_user_id uuid,
  p_session_id uuid, p_level text, p_auto boolean, p_preview boolean, p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  insert into analytics.runs (id, started_at, game_id, version_id, player_id, user_id, session_id, level_reached, auto, preview, token_hash)
  values (p_id, p_started_at, p_game_id, p_version_id, p_player_id, p_user_id, p_session_id, p_level, p_auto, p_preview, decode(p_token_hash, 'hex'));

  if not p_preview then
    insert into public.game_stats (game_id, plays) values (p_game_id, 1)
    on conflict (game_id) do update set plays = public.game_stats.plays + 1, updated_at = now();
  end if;
end
$$;
revoke execute on function public.start_run(uuid, timestamptz, uuid, uuid, uuid, uuid, uuid, text, boolean, boolean, text) from public, anon, authenticated;

create or replace function public.rollup_5m()
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  -- Expire runs whose tab died before the end beacon.
  update analytics.runs
     set ended_at = started_at + interval '10 minutes', outcome = 'quit', duration_ms = 600000, flagged = coalesce(flagged, 'expired')
   where ended_at is null and started_at < now() - interval '30 minutes';

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

  -- plays is maintained live by start_run.
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

-- Catch up plays for runs minted before this migration that the rollup had not counted yet.
update public.game_stats s
   set plays = greatest(s.plays, r.n), updated_at = now()
  from (select game_id, count(*) n from analytics.runs where preview = false group by game_id) r
 where r.game_id = s.game_id and r.n > s.plays;
