-- Public read grants are already in place via Supabase default privileges; this file pins the
-- intent explicitly so a future change to defaults cannot silently open or close tables.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.reserved_handles, public.handle_history,
  public.games, public.game_versions, public.game_stats, public.tags, public.game_tags
  to anon, authenticated;
grant select on public.upload_sessions, public.api_tokens to authenticated;
