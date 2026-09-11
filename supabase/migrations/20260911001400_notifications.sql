-- Notifications (realtime-enabled) and the helpers that create them.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('mention','reply','follow','like_milestone','remix','version_ready','version_rejected','report_resolved','game_hidden','comment')),
  actor_id uuid references public.profiles (id) on delete set null,
  game_id uuid references public.games (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "owner reads notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "owner marks notifications" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke insert, delete on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

create or replace function public.notify(p_user uuid, p_kind text, p_actor uuid, p_game uuid, p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked_between(p_user, p_actor) then return; end if;
  if p_kind = 'follow' and exists (
    select 1 from public.notifications where user_id = p_user and actor_id = p_actor and kind = 'follow' and created_at > now() - interval '7 days'
  ) then return; end if;
  insert into public.notifications (user_id, kind, actor_id, game_id, comment_id) values (p_user, p_kind, p_actor, p_game, p_comment);
end
$$;
revoke execute on function public.notify(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify(new.creator_id, 'follow', new.follower_id, null, null);
  return null;
end
$$;
create trigger follows_notify after insert on public.follows for each row execute function public.follows_notify();

-- Like milestones and remixes notify the creator.
create or replace function public.game_stats_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid;
begin
  if new.likes <> old.likes and new.likes in (10, 100, 1000, 10000) then
    select creator_id into creator from public.games where id = new.game_id;
    perform public.notify(creator, 'like_milestone', null, new.game_id, null);
  end if;
  if new.remixes > old.remixes then
    select creator_id into creator from public.games where id = new.game_id;
    perform public.notify(creator, 'remix', null, new.game_id, null);
  end if;
  return null;
end
$$;
create trigger game_stats_notify after update of likes, remixes on public.game_stats for each row execute function public.game_stats_notify();

-- Mentions: @handle in a comment notifies that user; replies notify the parent author.
create or replace function public.comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
  target uuid;
  parent_author uuid;
  creator uuid;
begin
  for h in
    select distinct lower(m[2]) from regexp_matches(new.body, '(^|[^a-z0-9_@])@([a-z0-9_]{3,20})', 'gi') as m
  loop
    select id into target from public.profiles where handle = h::extensions.citext;
    if target is null or target = new.author_id then continue; end if;
    insert into public.comment_mentions (comment_id, user_id) values (new.id, target) on conflict do nothing;
    perform public.notify(target, 'mention', new.author_id, new.game_id, new.id);
  end loop;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is not null and not exists (select 1 from public.comment_mentions where comment_id = new.id and user_id = parent_author) then
      perform public.notify(parent_author, 'reply', new.author_id, new.game_id, new.id);
    end if;
  else
    select creator_id into creator from public.games where id = new.game_id;
    if creator is not null and creator <> new.author_id and not exists (select 1 from public.comment_mentions where comment_id = new.id and user_id = creator) then
      perform public.notify(creator, 'comment', new.author_id, new.game_id, new.id);
    end if;
  end if;
  return null;
end
$$;
create trigger comments_mentions after insert on public.comments for each row execute function public.comments_after_insert();

create or replace function public.unread_notifications()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.unread_notifications() to authenticated;

-- Marks the given ids (or everything when null) read for the caller.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
