-- A play is the first run of a game in a browser session (sessionStorage, 30 min idle). Play again,
-- Restart and in-game retries still mint runs (scores, durations, leaderboards) but no longer add plays.
-- start_run now reports whether the run counted so the watch page only bumps its count when it did.

create index if not exists runs_game_session_idx on analytics.runs (game_id, session_id);

drop function if exists public.start_run(uuid, timestamptz, uuid, uuid, uuid, uuid, uuid, text, boolean, boolean, text);

create function public.start_run(
  p_id uuid, p_started_at timestamptz, p_game_id uuid, p_version_id uuid, p_player_id uuid, p_user_id uuid,
  p_session_id uuid, p_level text, p_auto boolean, p_preview boolean, p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  counted boolean := not p_preview and not exists (
    select 1 from analytics.runs r where r.game_id = p_game_id and r.session_id = p_session_id and r.preview = false
  );
begin
  insert into analytics.runs (id, started_at, game_id, version_id, player_id, user_id, session_id, level_reached, auto, preview, token_hash)
  values (p_id, p_started_at, p_game_id, p_version_id, p_player_id, p_user_id, p_session_id, p_level, p_auto, p_preview, decode(p_token_hash, 'hex'));

  if counted then
    insert into public.game_stats (game_id, plays) values (p_game_id, 1)
    on conflict (game_id) do update set plays = public.game_stats.plays + 1, updated_at = now();
  end if;
  return counted;
end
$$;
revoke execute on function public.start_run(uuid, timestamptz, uuid, uuid, uuid, uuid, uuid, text, boolean, boolean, text) from public, anon, authenticated;
