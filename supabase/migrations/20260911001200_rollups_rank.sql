-- Rollups and ranking. Plays come from server-minted runs; events feed views, drop-off and geo/device.

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

  update public.game_stats s
     set plays = agg.plays,
         runs = agg.runs_ended,
         completions = agg.completions,
         unique_players = (select count(*) from analytics.player_first_seen f where f.game_id = s.game_id),
         updated_at = now()
    from (select game_id, sum(plays) plays, sum(runs_ended) runs_ended, sum(completions) completions
            from public.game_stats_5m group by game_id) agg
   where agg.game_id = s.game_id
     and s.game_id in (select distinct game_id from analytics.runs where started_at >= now() - interval '10 minutes');
end
$$;

create or replace function public.rollup_daily()
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  d date := (now() at time zone 'utc')::date - 1;
  d0 timestamptz := (d::timestamp) at time zone 'utc';
  d1 timestamptz := ((d + 1)::timestamp) at time zone 'utc';
begin
  insert into public.game_daily as gd (game_id, day, views, plays, unique_players, runs, completions, median_duration_ms, p90_duration_ms,
                                       score_submits, likes, saves, by_country, by_device, by_referrer, dropoff)
  select g.id, d,
    (select count(*) from analytics.events e where e.game_id = g.id and e.name = 'view' and e.ts >= d0 and e.ts < d1),
    (select count(*) from analytics.runs r where r.game_id = g.id and r.preview = false and r.started_at >= d0 and r.started_at < d1),
    (select count(distinct player_id) from analytics.runs r where r.game_id = g.id and r.preview = false and r.started_at >= d0 and r.started_at < d1),
    (select count(*) from analytics.runs r where r.game_id = g.id and r.preview = false and r.ended_at >= d0 and r.ended_at < d1),
    (select count(*) from analytics.runs r where r.game_id = g.id and r.preview = false and r.ended_at >= d0 and r.ended_at < d1 and r.outcome = 'complete'),
    (select percentile_cont(0.5) within group (order by duration_ms) from analytics.runs r where r.game_id = g.id and r.preview = false and r.ended_at >= d0 and r.ended_at < d1 and r.flagged is null)::int,
    (select percentile_cont(0.9) within group (order by duration_ms) from analytics.runs r where r.game_id = g.id and r.preview = false and r.ended_at >= d0 and r.ended_at < d1 and r.flagged is null)::int,
    (select count(*) from analytics.events e where e.game_id = g.id and e.name = 'score_submit' and e.ts >= d0 and e.ts < d1),
    (select count(*) from public.likes l where l.game_id = g.id and l.created_at >= d0 and l.created_at < d1),
    (select count(*) from public.saves s where s.game_id = g.id and s.created_at >= d0 and s.created_at < d1),
    (select coalesce(jsonb_object_agg(country, n), '{}'::jsonb) from (select country, count(*) n from analytics.events e where e.game_id = g.id and e.name = 'view' and e.ts >= d0 and e.ts < d1 and country is not null group by 1 order by 2 desc limit 20) x),
    (select coalesce(jsonb_object_agg(coalesce(device_type, 'unknown'), n), '{}'::jsonb) from (select device_type, count(*) n from analytics.events e where e.game_id = g.id and e.name = 'view' and e.ts >= d0 and e.ts < d1 group by 1) x),
    (select coalesce(jsonb_object_agg(referrer_host, n), '{}'::jsonb) from (select coalesce(referrer_host, 'direct') referrer_host, count(*) n from analytics.events e where e.game_id = g.id and e.name = 'view' and e.ts >= d0 and e.ts < d1 group by 1 order by 2 desc limit 20) x),
    (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (select level, count(distinct run_id) n from analytics.events e where e.game_id = g.id and e.name = 'level_start' and e.ts >= d0 and e.ts < d1 and level is not null group by 1) x)
  from public.games g
  where exists (select 1 from analytics.runs r where r.game_id = g.id and r.started_at >= d0 and r.started_at < d1)
     or exists (select 1 from analytics.events e where e.game_id = g.id and e.ts >= d0 and e.ts < d1)
  on conflict (game_id, day) do update set
    views = excluded.views, plays = excluded.plays, unique_players = excluded.unique_players, runs = excluded.runs,
    completions = excluded.completions, median_duration_ms = excluded.median_duration_ms, p90_duration_ms = excluded.p90_duration_ms,
    score_submits = excluded.score_submits, likes = excluded.likes, saves = excluded.saves,
    by_country = excluded.by_country, by_device = excluded.by_device, by_referrer = excluded.by_referrer, dropoff = excluded.dropoff;

  -- Retention: D1 for the cohort of d-1, D7 for the cohort of d-7 (players who ran again on d).
  insert into public.retention_daily (game_id, cohort_day, cohort_size, d1, d7)
  select f.game_id, f.first_day, count(*),
         count(*) filter (where f.first_day = d - 1 and exists (select 1 from analytics.runs r where r.game_id = f.game_id and r.player_id = f.player_id and (r.started_at at time zone 'utc')::date = d)),
         count(*) filter (where f.first_day = d - 7 and exists (select 1 from analytics.runs r where r.game_id = f.game_id and r.player_id = f.player_id and (r.started_at at time zone 'utc')::date = d))
    from analytics.player_first_seen f
   where f.first_day in (d - 1, d - 7)
   group by 1, 2
  on conflict (game_id, cohort_day) do update set
    cohort_size = excluded.cohort_size,
    d1 = case when excluded.cohort_day = d - 1 then excluded.d1 else public.retention_daily.d1 end,
    d7 = case when excluded.cohort_day = d - 7 then excluded.d7 else public.retention_daily.d7 end;

  -- Runs are the play ledger; 90 days is plenty on the free tier.
  delete from analytics.runs where started_at < now() - interval '90 days';
  delete from public.game_stats_5m where bucket < now() - interval '14 days';
end
$$;

-- trending_score = (plays_7d + 3*completions_7d + 0.5*uniques_7d) / (hours_since_publish + 2)^1.5
-- hot_score      = sum over the last 48 h of plays * 0.5^(age_hours / 12)
create or replace function public.rank_feed()
returns void
language sql
security definer
set search_path = public
as $$
  with w as (
    select s.game_id,
           sum(s.plays)       filter (where s.bucket >= now() - interval '7 days')  as plays_7d,
           sum(s.completions) filter (where s.bucket >= now() - interval '7 days')  as completions_7d,
           sum(s.uniques)     filter (where s.bucket >= now() - interval '7 days')  as uniques_7d,
           sum(s.plays * power(0.5, extract(epoch from (now() - s.bucket)) / 3600.0 / 12.0))
                              filter (where s.bucket >= now() - interval '48 hours') as hot
      from public.game_stats_5m s
     where s.bucket >= now() - interval '7 days'
     group by s.game_id)
  update public.game_stats gs
     set trending_score = (coalesce(w.plays_7d, 0) + 3 * coalesce(w.completions_7d, 0) + 0.5 * coalesce(w.uniques_7d, 0))
                          / power(greatest(extract(epoch from (now() - g.published_at)) / 3600.0, 0) + 2, 1.5),
         hot_score = coalesce(w.hot, 0),
         updated_at = now()
    from public.games g
    left join w on w.game_id = g.id
   where gs.game_id = g.id and g.status = 'published' and g.published_at is not null;
$$;

revoke execute on function public.rollup_5m() from public, anon, authenticated;
revoke execute on function public.rollup_daily() from public, anon, authenticated;
revoke execute on function public.rank_feed() from public, anon, authenticated;

select cron.schedule('rollup_5m',    '*/5 * * * *',  $$select public.rollup_5m()$$);
select cron.schedule('rollup_daily', '0 2 * * *',    $$select public.rollup_daily()$$);
select cron.schedule('rank_feed',    '*/10 * * * *', $$select public.rank_feed()$$);
