-- Lifetime plays across every live game (sidebar stat). Same visibility rule as game_feed_v.
create or replace function public.total_plays()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(s.plays), 0)::bigint
    from public.game_stats s
    join public.games g on g.id = s.game_id
    join public.profiles p on p.id = g.creator_id
   where g.status = 'published' and p.banned_at is null;
$$;
grant execute on function public.total_plays() to anon, authenticated;
