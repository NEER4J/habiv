-- Ingest runs inside Vercel functions (after()). If one dies mid-run its version stays
-- "processing"; every 5 minutes this asks the app to re-run those, but only when one looks stuck,
-- so an idle site is never woken. The app caps re-runs per version (lib/jobs/trigger.ts).
--
-- URL and secret live in Vault so they never sit in a migration:
--   select vault.create_secret('https://www.habiv.com/api/jobs/cron?task=sweep', 'jobs_sweep_url');
--   select vault.create_secret('<CRON_SECRET>', 'jobs_sweep_secret');
create or replace function public.jobs_sweep_ping()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sweep_url text;
  sweep_secret text;
begin
  if not exists (
    select 1 from public.game_versions
    where status = 'processing' and updated_at < now() - interval '10 minutes'
  ) then
    return;
  end if;
  select decrypted_secret into sweep_url from vault.decrypted_secrets where name = 'jobs_sweep_url' limit 1;
  select decrypted_secret into sweep_secret from vault.decrypted_secrets where name = 'jobs_sweep_secret' limit 1;
  if sweep_url is null or sweep_secret is null then
    return;
  end if;
  perform net.http_get(
    url := sweep_url,
    headers := jsonb_build_object('authorization', 'Bearer ' || sweep_secret),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'jobs_sweep_ping failed: %', sqlerrm;
end
$$;

revoke all on function public.jobs_sweep_ping() from public, anon, authenticated;

select cron.schedule('jobs_sweep', '*/5 * * * *', $$select public.jobs_sweep_ping()$$);
