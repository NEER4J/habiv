-- Catalog: games, versions, stats, tags.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 64),
  short_id text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  tagline text check (char_length(tagline) <= 140),
  description text check (char_length(description) <= 4000),
  category text not null default 'arcade'
    check (category in ('arcade','puzzle','reaction','ambient','rhythm','racing','cozy','horror','experimental','other')),
  orientation text not null default 'any' check (orientation in ('portrait','landscape','any')),
  status text not null default 'draft' check (status in ('draft','processing','published','hidden','removed')),
  hidden_reason text,
  current_version_id uuid,
  remixed_from_game_id uuid references public.games (id) on delete set null,
  remix_licence text not null default 'open' check (remix_licence in ('open','no_remix')),
  cover_path text,
  card_path text,
  duration_sec int check (duration_sec between 1 and 3600),
  controls jsonb not null default '{}'::jsonb,
  accent_hue smallint not null default 0 check (accent_hue between 0 and 359),
  leaderboard_enabled boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, slug)
);

create index games_status_published_idx on public.games (status, published_at desc);
create index games_creator_idx on public.games (creator_id, updated_at desc);
create index games_remixed_from_idx on public.games (remixed_from_game_id) where remixed_from_game_id is not null;

create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  version int not null check (version >= 1),
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','rejected')),
  source text not null default 'web' check (source in ('web','mcp','remix')),
  agent text check (char_length(agent) <= 80),
  model text check (char_length(model) <= 80),
  prompt text check (char_length(prompt) <= 8000),
  engine text,
  entry_path text not null default 'index.html',
  upload_key text,
  bundle_prefix text,
  size_bytes bigint,
  file_count int,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  needs_isolation boolean not null default false,
  uses_network boolean not null default false,
  manifest jsonb,
  smoke jsonb,
  reject_reason text,
  changelog text check (char_length(changelog) <= 500),
  ingest_run_id text,
  auto_publish boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, version)
);

create index game_versions_game_idx on public.game_versions (game_id, version desc);
create index game_versions_sha_idx on public.game_versions (sha256) where sha256 is not null;
create index game_versions_status_idx on public.game_versions (status) where status in ('uploaded','processing');

alter table public.games
  add constraint games_current_version_fk
  foreign key (current_version_id) references public.game_versions (id) on delete set null;

create table public.game_stats (
  game_id uuid primary key references public.games (id) on delete cascade,
  plays bigint not null default 0,
  unique_players bigint not null default 0,
  runs bigint not null default 0,
  completions bigint not null default 0,
  likes int not null default 0,
  saves int not null default 0,
  remixes int not null default 0,
  comments int not null default 0,
  best_score bigint,
  trending_score double precision not null default 0,
  hot_score double precision not null default 0,
  updated_at timestamptz not null default now()
);
create index game_stats_trending_idx on public.game_stats (trending_score desc);
create index game_stats_hot_idx on public.game_stats (hot_score desc);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique check (name::text ~ '^[a-z0-9][a-z0-9 -]{0,23}$')
);

create table public.game_tags (
  game_id uuid not null references public.games (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (game_id, tag_id)
);
create index game_tags_tag_idx on public.game_tags (tag_id);

-- Triggers.
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger game_versions_set_updated_at before update on public.game_versions
  for each row execute function public.set_updated_at();

create or replace function public.games_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.short_id is null or new.short_id = '' then
    loop
      new.short_id := public.gen_short_id(8);
      exit when not exists (select 1 from public.games g where g.short_id = new.short_id);
    end loop;
  end if;
  new.accent_hue := abs(hashtext(new.short_id)) % 360;
  return new;
end
$$;
create trigger games_before_insert before insert on public.games
  for each row execute function public.games_before_insert();

create or replace function public.games_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.game_stats (game_id) values (new.id) on conflict do nothing;
  if new.remixed_from_game_id is not null then
    update public.game_stats set remixes = remixes + 1, updated_at = now() where game_id = new.remixed_from_game_id;
  end if;
  return new;
end
$$;
create trigger games_after_insert after insert on public.games
  for each row execute function public.games_after_insert();

-- RPCs.
create or replace function public.next_version_number(p_game_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(v.version), 0) + 1 from public.game_versions v where v.game_id = p_game_id;
$$;

create or replace function public.creator_storage_bytes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(v.size_bytes), 0)::bigint
    from public.game_versions v
    join public.games g on g.id = v.game_id
   where g.creator_id = p_user_id
     and v.status in ('uploaded','processing','ready');
$$;

-- Publishes a ready version of the caller's game.
-- Raises: not_signed_in, not_found, removed, hidden_by_moderation, version_not_found, version_not_ready.
create or replace function public.publish_game_version(p_game_id uuid, p_version_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.games;
  v public.game_versions;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.creator_id <> uid then raise exception 'not_found'; end if;
  if g.status = 'removed' then raise exception 'removed'; end if;
  if g.status = 'hidden' and g.hidden_reason in ('auto_reports','moderation') then raise exception 'hidden_by_moderation'; end if;
  select * into v from public.game_versions where id = p_version_id and game_id = p_game_id;
  if v.id is null then raise exception 'version_not_found'; end if;
  if v.status <> 'ready' then raise exception 'version_not_ready'; end if;
  update public.games
     set status = 'published',
         current_version_id = v.id,
         published_at = coalesce(published_at, now()),
         hidden_reason = null
   where id = p_game_id
  returning * into g;
  update public.profiles set is_creator = true where id = uid and not is_creator;
  return g;
end
$$;

-- Creator hides their own game (stays visible to them under "Hidden").
create or replace function public.unpublish_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.games;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.games
     set status = 'hidden', hidden_reason = 'creator'
   where id = p_game_id and creator_id = uid and status = 'published'
  returning * into g;
  if g.id is null then raise exception 'not_found'; end if;
  return g;
end
$$;

-- Row level security.
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.game_stats enable row level security;
alter table public.tags enable row level security;
alter table public.game_tags enable row level security;

create policy "published games are public" on public.games
  for select using (status = 'published' or creator_id = auth.uid() or public.is_admin());
create policy "creator inserts own games" on public.games
  for insert with check (creator_id = auth.uid());
create policy "creator updates own games" on public.games
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
-- Status, ownership and lineage change only through RPCs / service role.
revoke insert, update, delete on public.games from authenticated, anon;
grant insert (creator_id, slug, title, tagline, description, category, orientation, remix_licence, duration_sec, controls, remixed_from_game_id)
  on public.games to authenticated;
grant update (slug, title, tagline, description, category, orientation, remix_licence, cover_path, card_path, duration_sec, controls, leaderboard_enabled)
  on public.games to authenticated;

create policy "ready versions of published games are public" on public.game_versions
  for select using (
    (status = 'ready' and exists (select 1 from public.games g where g.id = game_id and g.status = 'published'))
    or exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid())
    or public.is_admin()
  );
revoke insert, update, delete on public.game_versions from authenticated, anon;

create policy "game stats are public" on public.game_stats for select using (true);
revoke insert, update, delete on public.game_stats from authenticated, anon;

create policy "tags are public" on public.tags for select using (true);
create policy "signed-in users add tags" on public.tags for insert with check (auth.uid() is not null);
revoke update, delete on public.tags from authenticated, anon;

create policy "game tags are public" on public.game_tags for select using (true);
create policy "creator tags own games" on public.game_tags
  for insert with check (exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid()));
create policy "creator untags own games" on public.game_tags
  for delete using (exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid()));

grant execute on function public.publish_game_version(uuid, uuid) to authenticated;
grant execute on function public.unpublish_game(uuid) to authenticated;
grant execute on function public.next_version_number(uuid) to authenticated;
grant execute on function public.creator_storage_bytes(uuid) to authenticated;
revoke execute on function public.gen_short_id(int) from public, anon, authenticated;
