-- Comments with replies, likes and @mentions.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  likes_count int not null default 0,
  reply_count int not null default 0,
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_game_created_idx on public.comments (game_id, created_at desc) where deleted_at is null and parent_id is null;
create index comments_game_top_idx on public.comments (game_id, pinned desc, likes_count desc) where deleted_at is null and parent_id is null;
create index comments_parent_idx on public.comments (parent_id, created_at) where parent_id is not null;
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table public.comment_mentions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Guards: blocks, link spam, duplicates, rate limit.
create or replace function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  creator uuid;
  parent_author uuid;
begin
  select creator_id into creator from public.games where id = new.game_id;
  if creator is null then raise exception 'game_not_found'; end if;
  if public.is_blocked_between(new.author_id, creator) then raise exception 'blocked'; end if;
  if new.parent_id is not null then
    select author_id, game_id into parent_author, creator from public.comments where id = new.parent_id;
    if parent_author is null then raise exception 'parent_not_found'; end if;
    if creator <> new.game_id then raise exception 'parent_mismatch'; end if;
    if public.is_blocked_between(new.author_id, parent_author) then raise exception 'blocked'; end if;
  end if;
  if (select count(*) from regexp_matches(new.body, 'https?://', 'g')) > 2 then raise exception 'too_many_links'; end if;
  if exists (select 1 from public.comments c where c.author_id = new.author_id and c.body = new.body and c.created_at > now() - interval '10 minutes') then
    raise exception 'duplicate';
  end if;
  if not public.rate_limit_hit('comment:' || new.author_id::text, interval '10 minutes', 10) then raise exception 'rate_limited'; end if;
  new.body := btrim(new.body);
  return new;
end
$$;
create trigger comments_before_insert before insert on public.comments for each row execute function public.comments_before_insert();

create or replace function public.comments_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid;
begin
  select creator_id into creator from public.games where id = old.game_id;
  if old.author_id = auth.uid() then
    if new.body is distinct from old.body then
      if old.created_at < now() - interval '15 minutes' then raise exception 'edit_window_closed'; end if;
      new.edited_at := now();
    end if;
  elsif creator = auth.uid() or public.is_admin() then
    -- Game creators and admins may only pin/unpin or soft delete.
    if new.body is distinct from old.body then raise exception 'not_allowed'; end if;
  elsif auth.uid() is not null then
    raise exception 'not_allowed';
  end if;
  -- Never let anyone touch counters or ownership through the API.
  new.likes_count := old.likes_count;
  new.reply_count := old.reply_count;
  new.author_id := old.author_id;
  new.game_id := old.game_id;
  new.parent_id := old.parent_id;
  new.created_at := old.created_at;
  return new;
end
$$;
create trigger comments_before_update before update on public.comments for each row execute function public.comments_before_update();

create or replace function public.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.game_stats set comments = comments + 1, updated_at = now() where game_id = new.game_id;
    if new.parent_id is not null then update public.comments set reply_count = reply_count + 1 where id = new.parent_id; end if;
  elsif tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    update public.game_stats set comments = greatest(comments - 1, 0), updated_at = now() where game_id = new.game_id;
    if new.parent_id is not null then update public.comments set reply_count = greatest(reply_count - 1, 0) where id = new.parent_id; end if;
  end if;
  return null;
end
$$;
create trigger comments_after_change after insert or update on public.comments for each row execute function public.comments_after_change();

create or replace function public.comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d int := case when tg_op = 'INSERT' then 1 else -1 end;
  cid uuid := case when tg_op = 'INSERT' then new.comment_id else old.comment_id end;
begin
  update public.comments set likes_count = greatest(likes_count + d, 0) where id = cid;
  return null;
end
$$;
create trigger comment_likes_count after insert or delete on public.comment_likes for each row execute function public.comment_likes_count();

alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.blocks enable row level security;

create policy "comments are public" on public.comments for select
  using (deleted_at is null or author_id = auth.uid() or public.is_admin());
create policy "signed-in users comment" on public.comments for insert with check (auth.uid() = author_id);
create policy "author, creator or admin updates" on public.comments for update
  using (auth.uid() = author_id or public.is_admin() or exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid()));
revoke delete on public.comments from anon, authenticated;
revoke insert, update on public.comments from anon, authenticated;
grant insert (game_id, author_id, parent_id, body) on public.comments to authenticated;
grant update (body, pinned, deleted_at) on public.comments to authenticated;

create policy "comment likes are public" on public.comment_likes for select using (true);
create policy "user likes comment" on public.comment_likes for insert with check (auth.uid() = user_id);
create policy "user unlikes comment" on public.comment_likes for delete using (auth.uid() = user_id);

create policy "mentions are public" on public.comment_mentions for select using (true);
revoke insert, update, delete on public.comment_mentions from anon, authenticated;

create policy "owner manages blocks" on public.blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
