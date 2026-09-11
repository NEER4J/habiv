-- Object storage on Supabase Storage while on free tiers (instead of R2).
-- The free plan caps every object at 50 MB. The app, jobs and game-origin worker reach these
-- buckets with S3 keys or the service key only, so storage.objects needs no RLS policies.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('habiv-uploads', 'habiv-uploads', false, 52428800),
  ('habiv-games', 'habiv-games', false, 52428800),
  ('habiv-public', 'habiv-public', true, 10485760)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
