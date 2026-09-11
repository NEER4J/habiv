-- Server-minted play runs (the play ledger), rollup targets, rate limits, player links.

create table analytics.runs (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  version_id uuid,
  player_id uuid not null,
  user_id uuid,
  session_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms int,
  outcome text check (outcome in ('complete','fail','quit')),
  score bigint,
  level_reached text,
  progress_pct smallint,
  token_hash bytea not null,
  auto boolean not null default false,
  preview boolean not null default false,
  flagged text,
  created_at timestamptz not null default now()
);
create index runs_game_started_idx on analytics.runs (game_id, started_at desc);
create index runs_player_started_idx on analytics.runs (player_id, started_at desc);
create index runs_open_idx on analytics.runs (started_at) where ended_at is null;
create index runs_game_score_idx on analytics.runs (game_id, score) where score is not null and flagged is null;

-- First time each player touched each game; survives event retention, drives uniques and D1/D7.
create table analytics.player_first_seen (
  game_id uuid not null,
  player_id uuid not null,
  first_day date not null,
  primary key (game_id, player_id)
);
create index player_first_seen_day_idx on analytics.player_first_seen (game_id, first_day);

create table analytics.player_links (
  player_id uuid primary key,
  user_id uuid not null,
  linked_at timestamptz not null default now()
);

create table analytics.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Public rollup tables (dashboards and feed read these; nothing reads raw events at request time).
create table public.game_stats_5m (
  game_id uuid not null references public.games (id) on delete cascade,
  bucket timestamptz not null,
  plays int not null default 0,
  uniques int not null default 0,
  runs_ended int not null default 0,
  completions int not null default 0,
  primary key (game_id, bucket)
);
create index game_stats_5m_bucket_idx on public.game_stats_5m (bucket desc);

create table public.game_daily (
  game_id uuid not null references public.games (id) on delete cascade,
  day date not null,
  views int not null default 0,
  plays int not null default 0,
  unique_players int not null default 0,
  runs int not null default 0,
  completions int not null default 0,
  median_duration_ms int,
  p90_duration_ms int,
  score_submits int not null default 0,
  likes int not null default 0,
  saves int not null default 0,
  remixes int not null default 0,
  by_country jsonb not null default '{}'::jsonb,
  by_device jsonb not null default '{}'::jsonb,
  by_referrer jsonb not null default '{}'::jsonb,
  dropoff jsonb not null default '{}'::jsonb,
  primary key (game_id, day)
);

create table public.retention_daily (
  game_id uuid not null references public.games (id) on delete cascade,
  cohort_day date not null,
  cohort_size int not null,
  d1 int not null default 0,
  d7 int not null default 0,
  primary key (game_id, cohort_day)
);

alter table public.game_stats_5m enable row level security;
alter table public.game_daily enable row level security;
alter table public.retention_daily enable row level security;
create policy "5m stats are public" on public.game_stats_5m for select using (true);
create policy "daily stats: creator or published" on public.game_daily for select
  using (exists (select 1 from public.games g where g.id = game_id and (g.creator_id = auth.uid() or g.status = 'published')));
create policy "retention: creator" on public.retention_daily for select
  using (exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid()));
revoke insert, update, delete on public.game_stats_5m, public.game_daily, public.retention_daily from anon, authenticated;

-- Fixed-window limiter. Returns true while under the limit.
create or replace function public.rate_limit_hit(p_key text, p_window interval, p_limit int, p_cost int default 1)
returns boolean
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  secs double precision := extract(epoch from p_window);
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / secs) * secs);
  c int;
begin
  insert into analytics.rate_limits (key, window_start, count) values (p_key, w, p_cost)
  on conflict (key, window_start) do update set count = analytics.rate_limits.count + excluded.count
  returning count into c;
  return c <= p_limit;
end
$$;
revoke execute on function public.rate_limit_hit(text, interval, int, int) from public, anon, authenticated;

-- One INSERT ... SELECT per batch. Server fields are already merged into each row by the route.
create or replace function public.ingest_events(p_rows jsonb)
returns int
language sql
security definer
set search_path = public, analytics
as $$
  with ins as (
    insert into analytics.events (client_ts, game_id, version_id, player_id, user_id, session_id, run_id, name,
                                  level, outcome, score, value, props, referrer_host, utm_source, utm_medium, utm_campaign,
                                  device_type, os, browser, country)
    select r.client_ts, r.game_id, r.version_id, r.player_id, r.user_id, r.session_id, r.run_id, r.name,
           r.level, r.outcome, r.score, r.value, coalesce(r.props, '{}'::jsonb), r.referrer_host, r.utm_source, r.utm_medium, r.utm_campaign,
           r.device_type, r.os, r.browser, r.country
      from jsonb_to_recordset(p_rows) as r(
           client_ts timestamptz, game_id uuid, version_id uuid, player_id uuid, user_id uuid, session_id uuid,
           run_id uuid, name text, level text, outcome text, score bigint, value double precision, props jsonb,
           referrer_host text, utm_source text, utm_medium text, utm_campaign text,
           device_type text, os text, browser text, country char(2))
    returning 1)
  select count(*)::int from ins;
$$;
revoke execute on function public.ingest_events(jsonb) from public, anon, authenticated;

-- Runs. The route mints id, started_at and the HMAC token; only the token hash is stored.
create or replace function public.start_run(
  p_id uuid, p_started_at timestamptz, p_game_id uuid, p_version_id uuid, p_player_id uuid, p_user_id uuid,
  p_session_id uuid, p_level text, p_auto boolean, p_preview boolean, p_token_hash text
)
returns void
language sql
security definer
set search_path = public, analytics
as $$
  insert into analytics.runs (id, started_at, game_id, version_id, player_id, user_id, session_id, level_reached, auto, preview, token_hash)
  values (p_id, p_started_at, p_game_id, p_version_id, p_player_id, p_user_id, p_session_id, p_level, p_auto, p_preview, decode(p_token_hash, 'hex'));
$$;
revoke execute on function public.start_run(uuid, timestamptz, uuid, uuid, uuid, uuid, uuid, text, boolean, boolean, text) from public, anon, authenticated;

create or replace function public.get_run(p_id uuid)
returns table (id uuid, game_id uuid, version_id uuid, player_id uuid, user_id uuid, started_at timestamptz, ended_at timestamptz,
               token_hash text, score bigint, outcome text, auto boolean, preview boolean, flagged text)
language sql
stable
security definer
set search_path = public, analytics
as $$
  select r.id, r.game_id, r.version_id, r.player_id, r.user_id, r.started_at, r.ended_at,
         encode(r.token_hash, 'hex'), r.score, r.outcome, r.auto, r.preview, r.flagged
    from analytics.runs r where r.id = p_id;
$$;
revoke execute on function public.get_run(uuid) from public, anon, authenticated;

-- Share of today's completed runs on this game with a lower score (0..100).
create or replace function public.run_percentile(p_game_id uuid, p_score bigint)
returns numeric
language sql
stable
security definer
set search_path = public, analytics
as $$
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where score < p_score) / count(*), 1) end
    from analytics.runs
   where game_id = p_game_id and score is not null and flagged is null and preview = false
     and started_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke execute on function public.run_percentile(uuid, bigint) from public, anon, authenticated;

create or replace function public.end_run(p_id uuid, p_outcome text, p_score bigint, p_level text, p_progress_pct int, p_flag text)
returns table (duration_ms int, beat_pct numeric)
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  r analytics.runs%rowtype;
  d int;
begin
  select * into r from analytics.runs where id = p_id for update;
  if r.id is null then raise exception 'run_not_found'; end if;
  if r.ended_at is not null then raise exception 'run_already_ended'; end if;
  d := greatest(0, least(2147483647, (extract(epoch from (now() - r.started_at)) * 1000)::bigint))::int;
  update analytics.runs
     set ended_at = now(), duration_ms = d, outcome = p_outcome, score = coalesce(p_score, score),
         level_reached = coalesce(p_level, level_reached), progress_pct = least(100, greatest(0, p_progress_pct)),
         flagged = coalesce(p_flag, flagged)
   where id = p_id;
  duration_ms := d;
  beat_pct := case when p_score is not null and p_outcome = 'complete' then public.run_percentile(r.game_id, p_score) else null end;
  return next;
end
$$;
revoke execute on function public.end_run(uuid, text, bigint, text, int, text) from public, anon, authenticated;

-- Attaches anonymous plays to the signed-in account (called by the client with the user's JWT).
create or replace function public.link_player(p_pid uuid)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  insert into analytics.player_links (player_id, user_id) values (p_pid, auth.uid())
    on conflict (player_id) do update set user_id = excluded.user_id, linked_at = now();
  update analytics.runs set user_id = auth.uid()
   where player_id = p_pid and user_id is null and started_at > now() - interval '90 days';
end
$$;
grant execute on function public.link_player(uuid) to authenticated;

create or replace function public.runs_today()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(plays), 0)::bigint from public.game_stats_5m
   where bucket >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
grant execute on function public.runs_today() to anon, authenticated;

select cron.schedule('rate_limits_gc', '23 3 * * *', $$delete from analytics.rate_limits where window_start < now() - interval '2 days'$$);
