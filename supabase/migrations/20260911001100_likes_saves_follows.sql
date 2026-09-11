-- Likes, saves (the Saved page) and follows, with counters kept by triggers.

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index likes_game_idx on public.likes (game_id, created_at desc);

create table public.saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index saves_game_idx on public.saves (game_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);
create index follows_creator_idx on public.follows (creator_id, created_at desc);

create or replace function public.bump_game_stat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text := tg_argv[0];
  d int := case when tg_op = 'INSERT' then 1 else -1 end;
  gid uuid := case when tg_op = 'INSERT' then new.game_id else old.game_id end;
begin
  execute format(
    'insert into public.game_stats (game_id, %I) values ($1, greatest($2, 0))
       on conflict (game_id) do update set %I = greatest(public.game_stats.%I + $2, 0), updated_at = now()',
    col, col, col
  ) using gid, d;
  return null;
end
$$;
create trigger likes_count after insert or delete on public.likes for each row execute function public.bump_game_stat('likes');
create trigger saves_count after insert or delete on public.saves for each row execute function public.bump_game_stat('saves');

create or replace function public.bump_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d int := case when tg_op = 'INSERT' then 1 else -1 end;
  f uuid := case when tg_op = 'INSERT' then new.follower_id else old.follower_id end;
  c uuid := case when tg_op = 'INSERT' then new.creator_id else old.creator_id end;
begin
  update public.profiles set followers_count = greatest(followers_count + d, 0) where id = c;
  update public.profiles set following_count = greatest(following_count + d, 0) where id = f;
  return null;
end
$$;
create trigger follows_count after insert or delete on public.follows for each row execute function public.bump_follow_counts();

alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.follows enable row level security;

create policy "likes are public" on public.likes for select using (true);
create policy "user likes" on public.likes for insert with check (auth.uid() = user_id);
create policy "user unlikes" on public.likes for delete using (auth.uid() = user_id);

create policy "owner sees saves" on public.saves for select using (auth.uid() = user_id);
create policy "user saves" on public.saves for insert with check (auth.uid() = user_id);
create policy "user unsaves" on public.saves for delete using (auth.uid() = user_id);

create policy "follows are public" on public.follows for select using (true);
create policy "user follows" on public.follows for insert with check (auth.uid() = follower_id);
create policy "user unfollows" on public.follows for delete using (auth.uid() = follower_id);

revoke update on public.likes, public.saves, public.follows from anon, authenticated;
