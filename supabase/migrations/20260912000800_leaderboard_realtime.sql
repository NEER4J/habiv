-- Watch pages refresh their board live when a score lands. Realtime applies the table's RLS, so
-- viewers only hear about the unflagged entries they could already read.
alter publication supabase_realtime add table public.leaderboard_entries;
