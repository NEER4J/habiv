-- One featured game per UTC day, picked the night before from games with a healthy completion rate.

create table public.daily_challenges (
  day date primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  leaderboard_id uuid references public.leaderboards (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.daily_challenges enable row level security;
create policy "daily challenge is public" on public.daily_challenges for select using (true);
revoke insert, update, delete on public.daily_challenges from anon, authenticated;

create or replace function public.pick_daily_challenge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target date := (now() at time zone 'utc')::date + 1;
  gid uuid;
  lb uuid;
begin
  if exists (select 1 from public.daily_challenges where day = target) then return; end if;

  with cand as (
    select g.id,
           sum(d.runs) as runs,
           sum(d.completions)::numeric / nullif(sum(d.runs), 0) as cr,
           max(coalesce(s.hot_score, 0)) as hot
      from public.games g
      join public.game_daily d on d.game_id = g.id and d.day >= target - 14
      left join public.game_stats s on s.game_id = g.id
     where g.status = 'published'
       and g.id not in (select game_id from public.daily_challenges where day > target - 30)
     group by g.id
    having sum(d.runs) >= 20
  ), top as (
    select id from cand where cr between 0.2 and 0.7 order by hot desc limit 10
  )
  select id into gid from top order by random() limit 1;

  if gid is null then
    select g.id into gid from public.games g join public.game_stats s on s.game_id = g.id
     where g.status = 'published' and g.id not in (select game_id from public.daily_challenges where day > target - 30)
     order by s.hot_score desc, g.published_at desc limit 1;
  end if;
  if gid is null then return; end if;

  insert into public.leaderboards (game_id, key, period) values (gid, 'daily', 'daily')
  on conflict (game_id, key, period) do nothing;
  select id into lb from public.leaderboards where game_id = gid and key = 'daily' and period = 'daily';
  insert into public.daily_challenges (day, game_id, leaderboard_id) values (target, gid, lb);
end
$$;
revoke execute on function public.pick_daily_challenge() from public, anon, authenticated;
select cron.schedule('daily_challenge', '0 0 * * *', $$select public.pick_daily_challenge()$$);
