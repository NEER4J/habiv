-- Admin access, admin-managed categories, featured games, site settings, bans.

-- Categories become a table so admins can add/rename/reorder without a deploy.
create table public.categories (
  slug text primary key check (slug ~ '^[a-z][a-z0-9_]{1,23}$'),
  name text not null check (char_length(name) between 1 and 32),
  icon text check (char_length(icon) <= 8),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.categories (slug, name, icon, sort_order) values
  ('arcade','Arcade','🕹️',10), ('puzzle','Puzzle','🧩',20), ('reaction','Reaction','⚡',30),
  ('ambient','Ambient','🌊',40), ('rhythm','Rhythm','🎵',50), ('racing','Racing','🏎️',60),
  ('cozy','Cozy','☕',70), ('horror','Horror','👻',80), ('experimental','Experimental','🧪',90),
  ('other','Other','✨',100);
alter table public.games drop constraint if exists games_category_check;
alter table public.games add constraint games_category_fk foreign key (category) references public.categories (slug) on update cascade;
alter table public.categories enable row level security;
create policy "categories are public" on public.categories for select using (true);
revoke insert, update, delete on public.categories from anon, authenticated;

-- Featured (staff picks / hero). Lower rank shows first.
alter table public.games add column if not exists featured_at timestamptz;
alter table public.games add column if not exists featured_rank int;
create index games_featured_idx on public.games (featured_rank, featured_at desc) where featured_at is not null;

-- Site-wide settings the admin edits (hero game, announcements, limits).
create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "settings are public" on public.site_settings for select using (true);
revoke insert, update, delete on public.site_settings from anon, authenticated;

-- Bans.
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_reason text;

-- Admin emails: any account signing up with one of these becomes an admin.
create table public.admin_emails (email extensions.citext primary key);
insert into public.admin_emails (email) values ('ittsneeraj@gmail.com');
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;

create or replace function public.grant_admin_by_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.email is not null and exists (select 1 from public.admin_emails a where a.email = new.email::extensions.citext) then
    update public.profiles set is_admin = true where id = new.id;
  end if;
  return new;
end
$$;
drop trigger if exists on_auth_user_admin on auth.users;
create trigger on_auth_user_admin after insert or update of email on auth.users
  for each row execute function public.grant_admin_by_email();
update public.profiles p set is_admin = true
  from auth.users u where u.id = p.id and u.email::extensions.citext in (select email from public.admin_emails);

-- Feed view gains featured columns (appended so create or replace works).
create or replace view public.game_feed_v
with (security_invoker = true)
as
select g.id, g.short_id, g.slug, g.title, g.tagline, g.description, g.category, g.orientation,
       g.cover_path, g.card_path, g.duration_sec, g.controls, g.accent_hue, g.remix_licence,
       g.leaderboard_enabled, g.published_at, g.created_at, g.updated_at,
       g.current_version_id, g.remixed_from_game_id,
       p.id as creator_id, p.handle::text as creator_handle, p.display_name as creator_name,
       p.avatar_path as creator_avatar, p.is_verified as creator_verified, p.followers_count,
       v.engine, v.model, v.agent, v.size_bytes, v.version as version_no,
       v.needs_isolation, v.uses_network,
       coalesce(s.plays, 0) as plays, coalesce(s.unique_players, 0) as unique_players,
       coalesce(s.runs, 0) as runs, coalesce(s.completions, 0) as completions,
       coalesce(s.likes, 0) as likes, coalesce(s.saves, 0) as saves, coalesce(s.remixes, 0) as remixes,
       coalesce(s.comments, 0) as comments, s.best_score,
       coalesce(s.trending_score, 0) as trending_score, coalesce(s.hot_score, 0) as hot_score,
       g.featured_at, g.featured_rank
  from public.games g
  join public.profiles p on p.id = g.creator_id
  left join public.game_versions v on v.id = g.current_version_id
  left join public.game_stats s on s.game_id = g.id
 where g.status = 'published' and p.banned_at is null;
grant select on public.game_feed_v to anon, authenticated;

-- Category counts for the category cells.
create or replace function public.category_counts()
returns table (slug text, name text, icon text, sort_order int, games bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.slug, c.name, c.icon, c.sort_order,
         (select count(*) from public.games g join public.profiles p on p.id = g.creator_id
           where g.category = c.slug and g.status = 'published' and p.banned_at is null)
    from public.categories c where c.active order by c.sort_order, c.name;
$$;
grant execute on function public.category_counts() to anon, authenticated;

-- Search over published games.
create or replace function public.search_games(q text, max_rows int default 12)
returns setof public.game_feed_v
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.game_feed_v v
   where q is not null and btrim(q) <> ''
     and (v.title ilike '%' || btrim(q) || '%' or v.creator_handle ilike '%' || btrim(q) || '%'
          or coalesce(v.tagline, '') ilike '%' || btrim(q) || '%' or coalesce(v.model, '') ilike '%' || btrim(q) || '%')
   order by v.trending_score desc, v.plays desc
   limit least(greatest(max_rows, 1), 50);
$$;
grant execute on function public.search_games(text, int) to anon, authenticated;

-- Platform totals for the admin overview.
create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, analytics
as $$
  select case when public.is_admin() then jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'creators', (select count(*) from public.profiles where is_creator),
    'games_published', (select count(*) from public.games where status = 'published'),
    'games_total', (select count(*) from public.games),
    'versions_processing', (select count(*) from public.game_versions where status in ('uploaded','processing')),
    'versions_rejected', (select count(*) from public.game_versions where status = 'rejected'),
    'storage_bytes', (select coalesce(sum(size_bytes), 0) from public.game_versions where status = 'ready'),
    'plays_today', public.runs_today(),
    'plays_7d', (select coalesce(sum(plays), 0) from public.game_stats_5m where bucket >= now() - interval '7 days'),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'comments', (select count(*) from public.comments where deleted_at is null)
  ) else null end;
$$;
grant execute on function public.admin_stats() to authenticated;

-- Emails and sign-in dates for the admin user list (auth schema is not exposed to the API).
create or replace function public.admin_user_emails(p_ids uuid[])
returns table (id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz, provider text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.last_sign_in_at, u.created_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email')
    from auth.users u
   where public.is_admin() and u.id = any (p_ids);
$$;
grant execute on function public.admin_user_emails(uuid[]) to authenticated;

-- Banned users cannot publish, comment or follow.
create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select banned_at is not null from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_banned() to anon, authenticated;
drop policy "creator inserts own games" on public.games;
create policy "creator inserts own games" on public.games for insert with check (creator_id = auth.uid() and not public.is_banned());
drop policy "signed-in users comment" on public.comments;
create policy "signed-in users comment" on public.comments for insert with check (auth.uid() = author_id and not public.is_banned());

-- Ready versions of any game are visible to admins (moderation preview), on top of the existing rule.
drop policy "ready versions of published games are public" on public.game_versions;
create policy "ready versions of published games are public" on public.game_versions
  for select using (
    (status = 'ready' and exists (select 1 from public.games g where g.id = game_id and g.status = 'published'))
    or exists (select 1 from public.games g where g.id = game_id and g.creator_id = auth.uid())
    or public.is_admin()
  );
