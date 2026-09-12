-- Dislikes. Private to the person who cast them (the page shows no public count, like YouTube);
-- the total is kept in game_stats for admins. A like and a dislike cancel each other out.

create table public.dislikes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index dislikes_game_idx on public.dislikes (game_id);

alter table public.game_stats add column dislikes int not null default 0;

create trigger dislikes_count after insert or delete on public.dislikes for each row execute function public.bump_game_stat('dislikes');

-- Liking clears the viewer's dislike of the same game, and disliking clears their like.
create or replace function public.clear_opposite_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'likes' then
    delete from public.dislikes where user_id = new.user_id and game_id = new.game_id;
  else
    delete from public.likes where user_id = new.user_id and game_id = new.game_id;
  end if;
  return null;
end
$$;
create trigger likes_clear_dislike after insert on public.likes for each row execute function public.clear_opposite_reaction();
create trigger dislikes_clear_like after insert on public.dislikes for each row execute function public.clear_opposite_reaction();

alter table public.dislikes enable row level security;
create policy "owner sees dislikes" on public.dislikes for select using (auth.uid() = user_id);
create policy "user dislikes" on public.dislikes for insert with check (auth.uid() = user_id);
create policy "user undislikes" on public.dislikes for delete using (auth.uid() = user_id);

grant select, insert, delete on public.dislikes to authenticated;
revoke update on public.dislikes from anon, authenticated;
