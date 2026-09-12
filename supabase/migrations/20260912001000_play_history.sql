-- Play history: the games a viewer has played (by account and by this browser's hv_pid), last played
-- first, with rounds, time played, last score and their best and rank on the game's all-time main board.
-- analytics is not exposed, so this is a security definer read for the service role only: the server
-- passes ids it verified itself (auth claims, the hv_pid cookie), never ids from the browser.
-- Runs are kept 90 days (rollup_daily), so the history covers that window.

create index if not exists runs_user_started_idx on analytics.runs (user_id, started_at desc);

create or replace function public.play_history(p_user uuid, p_pid uuid, p_limit int default 60)
returns table (
  game_id uuid,
  rounds bigint,
  first_played_at timestamptz,
  last_played_at timestamptz,
  played_ms bigint,
  last_score bigint,
  best_score bigint,
  board_rank bigint,
  board_total bigint
)
language sql
stable
security definer
set search_path = public, analytics
as $$
  with mine as (
    select r.game_id, r.started_at, r.duration_ms, r.score
      from analytics.runs r
     where r.preview is not true
       and ((p_user is not null and r.user_id = p_user) or (p_pid is not null and r.player_id = p_pid))
  ),
  per_game as (
    select m.game_id,
           count(*) as rounds,
           min(m.started_at) as first_played_at,
           max(m.started_at) as last_played_at,
           coalesce(sum(m.duration_ms), 0)::bigint as played_ms,
           (array_agg(m.score order by m.started_at desc) filter (where m.score is not null))[1] as last_score,
           max(m.score) as max_score
      from mine m
     group by m.game_id
     order by max(m.started_at) desc
     limit least(greatest(p_limit, 1), 200)
  )
  select g.game_id, g.rounds, g.first_played_at, g.last_played_at, g.played_ms, g.last_score,
         -- With a board, "best" is the ranked score; without one, the highest score any run reported.
         case when b.id is null then g.max_score else me.score end as best_score,
         rk.rank as board_rank,
         rk.total as board_total
    from per_game g
    left join public.leaderboards b on b.game_id = g.game_id and b.key = 'main' and b.period = 'alltime'
    left join lateral (
      select e.score
        from public.leaderboard_entries e
       where e.leaderboard_id = b.id and e.flagged is null
         and ((p_user is not null and e.user_id = p_user) or (p_pid is not null and e.player_id = p_pid))
       order by case when b.sort = 'asc' then e.score else -e.score end
       limit 1
    ) me on true
    left join lateral (
      select count(*) filter (where (b.sort = 'asc' and e.score < me.score) or (b.sort <> 'asc' and e.score > me.score)) + 1 as rank,
             count(*) as total
        from public.leaderboard_entries e
       where e.leaderboard_id = b.id and e.flagged is null
    ) rk on me.score is not null
   order by g.last_played_at desc;
$$;
revoke execute on function public.play_history(uuid, uuid, int) from public, anon, authenticated;
