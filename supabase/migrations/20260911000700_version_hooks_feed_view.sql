-- Game-origin cache hooks (pg_net -> Worker KV) and the public feed read model.

-- Hook URL and secret live in Vault so they never sit in a migration:
--   select vault.create_secret('https://habiv-play.<account>.workers.dev/__hooks/version', 'game_origin_hook_url');
--   select vault.create_secret('<GAME_ORIGIN_HOOK_SECRET>', 'game_origin_hook_secret');
create or replace function public.game_origin_hook(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hook_url text;
  hook_secret text;
begin
  select decrypted_secret into hook_url from vault.decrypted_secrets where name = 'game_origin_hook_url' limit 1;
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'game_origin_hook_secret' limit 1;
  if hook_url is null or hook_secret is null then
    return;
  end if;
  perform net.http_post(
    url := hook_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-habiv-hook-secret', hook_secret),
    body := p_body,
    timeout_milliseconds := 5000
  );
exception when others then
  -- Never let a cache hook block a status change; the Worker falls back to a REST lookup.
  raise warning 'game_origin_hook failed: %', sqlerrm;
end
$$;
revoke execute on function public.game_origin_hook(jsonb) from public, anon, authenticated;

create or replace function public.game_versions_notify_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_origin_hook(jsonb_build_object(
    'version_id', new.id,
    'game_id', new.game_id,
    'status', new.status,
    'needs_isolation', new.needs_isolation,
    'uses_network', new.uses_network,
    'entry_path', new.entry_path
  ));
  return null;
end
$$;
create trigger game_versions_notify_origin
  after update of status, needs_isolation, uses_network, entry_path on public.game_versions
  for each row execute function public.game_versions_notify_origin();

create or replace function public.games_notify_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and (new.status = 'removed' or old.status = 'removed') then
    perform public.game_origin_hook(jsonb_build_object('game_id', new.id, 'game_status', new.status));
  end if;
  return null;
end
$$;
create trigger games_notify_origin
  after update of status on public.games
  for each row execute function public.games_notify_origin();

-- Feed read model: one row per published game with creator, current version and stats.
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
       coalesce(s.trending_score, 0) as trending_score, coalesce(s.hot_score, 0) as hot_score
  from public.games g
  join public.profiles p on p.id = g.creator_id
  left join public.game_versions v on v.id = g.current_version_id
  left join public.game_stats s on s.game_id = g.id
 where g.status = 'published';

grant select on public.game_feed_v to anon, authenticated;
