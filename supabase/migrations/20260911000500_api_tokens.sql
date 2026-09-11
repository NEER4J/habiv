-- Personal API tokens for MCP / REST publishing. Only the sha256 hash is stored.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  prefix text not null,
  scopes text[] not null default '{publish}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;
create policy "owner lists own tokens" on public.api_tokens
  for select using (auth.uid() = user_id);
create policy "owner revokes own tokens" on public.api_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- The hash column is never readable by clients; inserts go through the service role.
revoke all on public.api_tokens from authenticated, anon;
grant select (id, user_id, name, prefix, scopes, last_used_at, revoked_at, created_at) on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;
