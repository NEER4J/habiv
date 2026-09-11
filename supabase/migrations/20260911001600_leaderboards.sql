-- Leaderboards with server-side anti-cheat (submit path lives in /api/runs/score).

create table public.leaderboards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  key text not null default 'main' check (key ~ '^[a-z0-9_]{1,32}$'),
  period text not null check (period in ('daily','weekly','alltime')),
  sort text not null default 'desc' check (sort in ('desc','asc')),
  max_per_second numeric,
  min_duration_ms int not null default 1000,
  created_at timestamptz not null default now(),
  unique (game_id, key, period)
);

create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  leaderboard_id uuid not null references public.leaderboards (id) on delete cascade,
  period_start date not null,
  player_id uuid not null,
  user_id uuid references public.profiles (id) on delete set null,
  run_id uuid,
  score bigint not null,
  is_bot boolean not null default false,
  bot_label text,
  flagged text,
  created_at timestamptz not null default now()
);
-- One live row per player per period; submit_score keeps the best score in it.
create unique index lb_best_per_player on public.leaderboard_entries (leaderboard_id, period_start, player_id) where flagged is null;
create unique index lb_one_per_run on public.leaderboard_entries (leaderboard_id, run_id) where run_id is not null;
create index lb_rank_desc on public.leaderboard_entries (leaderboard_id, period_start, score desc) where flagged is null;
create index lb_rank_asc on public.leaderboard_entries (leaderboard_id, period_start, score asc) where flagged is null;

alter table public.leaderboards enable row level security;
alter table public.leaderboard_entries enable row level security;
create policy "boards are public" on public.leaderboards for select using (true);
create policy "entries are public" on public.leaderboard_entries for select using (flagged is null);
revoke insert, update, delete on public.leaderboards, public.leaderboard_entries from anon, authenticated;

create or replace function public.period_start_for(p_period text)
returns date
language sql
stable
as $$
  select case p_period
           when 'daily' then (now() at time zone 'utc')::date
           when 'weekly' then date_trunc('week', now() at time zone 'utc')::date
           else date '1970-01-01' end;
$$;

-- Creator configures the "main" board (three period rows) from the publish wizard / settings.
create or replace function public.set_leaderboard_config(p_game_id uuid, p_enabled boolean, p_sort text default 'desc', p_max_per_second numeric default null, p_min_duration_ms int default 1000)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  per text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.games where id = p_game_id and creator_id = uid) then raise exception 'not_found'; end if;
  update public.games set leaderboard_enabled = p_enabled where id = p_game_id;
  if p_enabled then
    foreach per in array array['daily','weekly','alltime'] loop
      insert into public.leaderboards (game_id, key, period, sort, max_per_second, min_duration_ms)
      values (p_game_id, 'main', per, p_sort, p_max_per_second, p_min_duration_ms)
      on conflict (game_id, key, period) do update
        set sort = excluded.sort, max_per_second = excluded.max_per_second, min_duration_ms = excluded.min_duration_ms;
    end loop;
  end if;
end
$$;
grant execute on function public.set_leaderboard_config(uuid, boolean, text, numeric, int) to authenticated;

-- Service role only: writes one entry per configured period for the key, keeping the best score.
create or replace function public.submit_score(p_run uuid, p_key text, p_score bigint, p_flag text)
returns table (leaderboard_id uuid, period text, rank bigint, personal_best boolean)
language plpgsql
security definer
set search_path = public, analytics
as $$
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

create or replace function public.set_run_score(p_run uuid, p_score bigint)
returns void
language sql
security definer
set search_path = public, analytics
as $$
  update analytics.runs set score = p_score where id = p_run and score is null;
$$;
revoke execute on function public.set_run_score(uuid, bigint) from public, anon, authenticated;

-- Viewer's rank on a board (by player id, falling back to user id).
create or replace function public.leaderboard_rank(p_game_id uuid, p_key text, p_period text, p_player_id uuid, p_user_id uuid)
returns table (rank bigint, score bigint, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.leaderboards%rowtype;
  ps date;
  my bigint;
begin
  select * into b from public.leaderboards where game_id = p_game_id and key = p_key and period = p_period;
  if b.id is null then return; end if;
  ps := public.period_start_for(p_period);
  select e.score into my from public.leaderboard_entries e
   where e.leaderboard_id = b.id and e.period_start = ps and e.flagged is null
     and (e.player_id = p_player_id or (p_user_id is not null and e.user_id = p_user_id))
   order by case when b.sort = 'desc' then -e.score else e.score end limit 1;
  if my is null then return; end if;
  select count(*) + 1, my, (select count(*) from public.leaderboard_entries t where t.leaderboard_id = b.id and t.period_start = ps and t.flagged is null)
    into rank, score, total
    from public.leaderboard_entries e2
   where e2.leaderboard_id = b.id and e2.period_start = ps and e2.flagged is null
     and ((b.sort = 'desc' and e2.score > my) or (b.sort = 'asc' and e2.score < my));
  return next;
end
$$;
grant execute on function public.leaderboard_rank(uuid, text, text, uuid, uuid) to anon, authenticated;

select cron.schedule('leaderboard_gc', '45 3 * * *', $$
  delete from public.leaderboard_entries e using public.leaderboards b
   where e.leaderboard_id = b.id and b.period = 'daily' and e.period_start < (now() at time zone 'utc')::date - 30
$$);
