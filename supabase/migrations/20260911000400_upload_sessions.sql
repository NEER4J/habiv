-- Browser and agent uploads to R2 (presigned single PUT or multipart).
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  version_id uuid not null references public.game_versions (id) on delete cascade,
  mode text not null check (mode in ('single','multipart')),
  key text not null,
  r2_upload_id text,
  filename text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  parts jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','completed','aborted','expired')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index upload_sessions_user_upload_idx on public.upload_sessions (user_id, r2_upload_id);
create index upload_sessions_version_idx on public.upload_sessions (version_id);
create trigger upload_sessions_set_updated_at before update on public.upload_sessions
  for each row execute function public.set_updated_at();

alter table public.upload_sessions enable row level security;
create policy "owner reads own upload sessions" on public.upload_sessions
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.upload_sessions from authenticated, anon;
