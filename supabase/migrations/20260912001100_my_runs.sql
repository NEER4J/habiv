-- A viewer's recent scored runs on one game, newest first, so they can share a specific run (an
-- old score, not only their best). Same trust model as play_history: analytics is not exposed, so
-- this is a security definer read for the service role only, called with ids the server verified
-- itself (auth claims, the hv_pid cookie). Runs are kept 90 days, so older runs drop off.

create or replace function public.my_runs(p_user uuid, p_pid uuid, p_game uuid, p_limit int default 20)
returns table (
  id uuid,
  started_at timestamptz,
  duration_ms int,
  score bigint,
  outcome text
)
language sql
stable
security definer
set search_path = public, analytics
as $$
  select r.id, r.started_at, r.duration_ms, r.score, r.outcome
    from analytics.runs r
   where r.game_id = p_game
     and r.preview is not true
     and r.flagged is null
     and r.score is not null
     and ((p_user is not null and r.user_id = p_user) or (p_pid is not null and r.player_id = p_pid))
   order by r.started_at desc
   limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.my_runs(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.my_runs(uuid, uuid, uuid, int) to service_role;
