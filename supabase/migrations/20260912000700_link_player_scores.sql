-- Signing in also hands this browser's guest leaderboard entries to the account, so a score set
-- before signing in shows under the player's name (and handle, once onboarding sets it).
create or replace function public.link_player(p_pid uuid)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  insert into analytics.player_links (player_id, user_id) values (p_pid, auth.uid())
    on conflict (player_id) do update set user_id = excluded.user_id, linked_at = now();
  update analytics.runs set user_id = auth.uid()
   where player_id = p_pid and user_id is null and started_at > now() - interval '90 days';
  update public.leaderboard_entries set user_id = auth.uid()
   where player_id = p_pid and user_id is null;
end
$$;
grant execute on function public.link_player(uuid) to authenticated;
