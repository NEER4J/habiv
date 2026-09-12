-- Games can sit in up to three categories. games.category stays the main one (first in the array;
-- keeps its foreign key and every existing reader); games.categories holds all of them.

alter table public.games add column if not exists categories text[] not null default '{}';
update public.games set categories = array[category] where cardinality(categories) = 0;
create index if not exists games_categories_gin on public.games using gin (categories);

grant insert (categories), update (categories) on public.games to authenticated;

-- Keeps category and categories in step, whichever one a writer sets.
create or replace function public.games_sync_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text[];
begin
  -- Trimmed, blanks dropped, de-duplicated, first mention wins.
  select coalesce(array_agg(s order by first_at), '{}') into cleaned
    from (select btrim(u.s) as s, min(u.n) as first_at
            from unnest(coalesce(new.categories, '{}')) with ordinality as u(s, n)
           where coalesce(btrim(u.s), '') <> ''
           group by btrim(u.s)) d;

  if tg_op = 'UPDATE' and new.categories is not distinct from old.categories and new.category is distinct from old.category then
    -- Only the main category changed (older writers, admin reassignments): move it to the front.
    cleaned := array_prepend(new.category, array_remove(cleaned, new.category));
  elsif cardinality(cleaned) = 0 then
    cleaned := array[new.category];
  end if;

  cleaned := cleaned[1:3];

  -- Only newly added slugs are checked, so a slug rename cascading through games.category still passes.
  if exists (
    select 1 from unnest(cleaned) as s
     where not exists (select 1 from public.categories c where c.slug = s)
       and (tg_op = 'INSERT' or not (s = any (coalesce(old.categories, '{}'))))
  ) then
    raise exception 'unknown_category' using errcode = '23503';
  end if;

  new.categories := cleaned;
  new.category := cleaned[1];
  return new;
end;
$$;

drop trigger if exists games_sync_categories on public.games;
create trigger games_sync_categories before insert or update of category, categories on public.games
  for each row execute function public.games_sync_categories();

-- A renamed or deleted category leaves the arrays too (games.category follows through its foreign key).
create or replace function public.categories_sync_games()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    update public.games set categories = array_replace(categories, old.slug, new.slug) where old.slug = any (categories);
    return new;
  end if;
  update public.games set categories = array_remove(categories, old.slug) where old.slug = any (categories);
  return old;
end;
$$;

drop trigger if exists categories_sync_games on public.categories;
create trigger categories_sync_games after update of slug or delete on public.categories
  for each row execute function public.categories_sync_games();

-- Feed view gains categories (appended so create or replace works).
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
       g.featured_at, g.featured_rank,
       g.categories
  from public.games g
  join public.profiles p on p.id = g.creator_id
  left join public.game_versions v on v.id = g.current_version_id
  left join public.game_stats s on s.game_id = g.id
 where g.status = 'published' and p.banned_at is null;
grant select on public.game_feed_v to anon, authenticated;

-- A game counts in every category it lists.
create or replace function public.category_counts()
returns table (slug text, name text, icon text, sort_order int, games bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.slug, c.name, c.icon, c.sort_order,
         (select count(*) from public.games g join public.profiles p on p.id = g.creator_id
           where c.slug = any (g.categories) and g.status = 'published' and p.banned_at is null)
    from public.categories c where c.active order by c.sort_order, c.name;
$$;
grant execute on function public.category_counts() to anon, authenticated;
