-- Extensions and shared helpers.
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Keeps updated_at fresh on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 8-char base62 id generator (used for games.short_id).
create or replace function public.gen_short_id(len int default 8)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  chars constant text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  b bytea := extensions.gen_random_bytes(len);
  o text := '';
  i int;
begin
  for i in 0..len - 1 loop
    o := o || substr(chars, (get_byte(b, i) % 62) + 1, 1);
  end loop;
  return o;
end
$$;
