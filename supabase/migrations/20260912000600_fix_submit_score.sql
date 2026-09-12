-- submit_score never stored a clean score: its OUT column leaderboard_id clashed with the
-- leaderboard_entries column named in ON CONFLICT ("column reference is ambiguous"), so every
-- unflagged submit failed with store_failed while flagged ones (plain ON CONFLICT DO NOTHING) went in.
-- use_column resolves the names to the table. It also keeps game_stats.best_score, which nothing wrote.

create or replace function public.submit_score(p_run uuid, p_key text, p_score bigint, p_flag text)
returns table (leaderboard_id uuid, period text, rank bigint, personal_best boolean)
language plpgsql
security definer
set search_path = public, analytics
as $$
#variable_conflict use_column
declare
  r analytics.runs%rowtype;
  b public.leaderboards%rowtype;
  ps date;
  affected int;
begin
  select * into r from analytics.runs where id = p_run;
  if r.id is null then raise exception 'run_not_found'; end if;
  for b in select * from public.leaderboards where game_id = r.game_id and key = p_key loop
    ps := public.period_start_for(b.period);
    if p_flag is not null then
      insert into public.leaderboard_entries (leaderboard_id, period_start, player_id, user_id, run_id, score, flagged)
      values (b.id, ps, r.player_id, r.user_id, r.id, p_score, p_flag)
      on conflict do nothing;
      continue;
    end if;
    insert into public.leaderboard_entries as e (leaderboard_id, period_start, player_id, user_id, run_id, score)
    values (b.id, ps, r.player_id, r.user_id, r.id, p_score)
    on conflict (leaderboard_id, period_start, player_id) where flagged is null do update
      set score = excluded.score, run_id = excluded.run_id, user_id = coalesce(excluded.user_id, e.user_id), created_at = now()
      where (b.sort = 'desc' and excluded.score > e.score) or (b.sort = 'asc' and excluded.score < e.score);
    get diagnostics affected = row_count;

    if p_key = 'main' and b.period = 'alltime' then
      insert into public.game_stats as s (game_id, best_score) values (r.game_id, p_score)
      on conflict (game_id) do update
        set best_score = case when s.best_score is null then excluded.best_score
                              when b.sort = 'asc' then least(s.best_score, excluded.best_score)
                              else greatest(s.best_score, excluded.best_score) end,
            updated_at = now();
    end if;

    leaderboard_id := b.id;
    period := b.period;
    personal_best := affected > 0;
    select count(*) + 1 into rank from public.leaderboard_entries e2
     where e2.leaderboard_id = b.id and e2.period_start = ps and e2.flagged is null
       and ((b.sort = 'desc' and e2.score > p_score) or (b.sort = 'asc' and e2.score < p_score));
    return next;
  end loop;
end
$$;
revoke execute on function public.submit_score(uuid, text, bigint, text) from public, anon, authenticated;

-- Catch up best_score from whatever the all-time boards already hold.
update public.game_stats s
   set best_score = x.best, updated_at = now()
  from (select b.game_id, case when b.sort = 'asc' then min(e.score) else max(e.score) end as best
          from public.leaderboards b
          join public.leaderboard_entries e on e.leaderboard_id = b.id and e.flagged is null
         where b.key = 'main' and b.period = 'alltime'
         group by b.game_id, b.sort) x
 where x.game_id = s.game_id;
