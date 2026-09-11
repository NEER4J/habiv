-- Identity: profiles, handles, reserved names, handle history.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext not null unique,
  display_name text check (char_length(display_name) <= 40),
  avatar_path text,
  bio text check (char_length(bio) <= 160),
  links jsonb not null default '[]'::jsonb,
  pronouns text check (char_length(pronouns) <= 24),
  is_creator boolean not null default false,
  is_verified boolean not null default false,
  is_admin boolean not null default false,
  handle_set boolean not null default false,
  handle_changed_at timestamptz,
  followers_count int not null default 0,
  following_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle::text ~ '^[a-z][a-z0-9_]{2,19}$' and handle::text !~ '__'),
  constraint profiles_links_is_array check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 3)
);

create index profiles_handle_trgm on public.profiles using gin ((handle::text) extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.reserved_handles (
  handle extensions.citext primary key,
  reason text not null default 'route'
);

insert into public.reserved_handles (handle, reason) values
  ('g','route'),('explore','route'),('trending','route'),('saved','route'),('settings','route'),
  ('publish','route'),('auth','route'),('api','route'),('admin','route'),('mcp','route'),('play','route'),
  ('help','route'),('about','route'),('login','route'),('signup','route'),('onboarding','route'),
  ('u','route'),('cdn','route'),('sdk','route'),('user','route'),('profile','route'),('my-games','route'),
  ('embed','route'),('e','route'),('v','route'),('legal','route'),('terms','route'),('privacy','route'),
  ('habiv','brand'),('habiv_official','brand'),('habivteam','brand'),('habiv_team','brand'),
  ('support','brand'),('staff','brand'),('moderator','brand'),('mod','brand'),('official','brand'),
  ('root','brand'),('system','brand'),('null','brand'),('undefined','brand'),('anonymous','brand'),
  ('fuck','profanity'),('shit','profanity'),('cunt','profanity'),('nigger','profanity'),('nigga','profanity'),
  ('faggot','profanity'),('retard','profanity'),('hitler','profanity'),('nazi','profanity');

create table public.handle_history (
  handle extensions.citext not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  released_at timestamptz not null default now(),
  primary key (handle, released_at)
);
create index handle_history_handle_idx on public.handle_history (handle, released_at desc);

-- Admin check used by policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- New auth user -> placeholder profile (user_xxxxxxxx).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
  n text;
begin
  loop
    h := 'user_' || left(encode(extensions.gen_random_bytes(6), 'hex'), 8);
    exit when not exists (select 1 from public.profiles where handle = h::extensions.citext);
  end loop;
  n := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  insert into public.profiles (id, handle, display_name)
  values (new.id, h, nullif(left(n, 40), ''))
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this migration.
do $$
declare
  u record;
  h text;
begin
  for u in select id, email, raw_user_meta_data from auth.users where id not in (select id from public.profiles) loop
    loop
      h := 'user_' || left(encode(extensions.gen_random_bytes(6), 'hex'), 8);
      exit when not exists (select 1 from public.profiles where handle = h::extensions.citext);
    end loop;
    insert into public.profiles (id, handle, display_name)
    values (u.id, h, nullif(left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, ''), '@', 1)), 40), ''));
  end loop;
end
$$;

-- Availability check used live by onboarding and settings.
-- Callable anonymously; the caller's own current handle counts as available to them.
create or replace function public.is_handle_available(h text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v text := lower(btrim(coalesce(h, '')));
begin
  if v !~ '^[a-z][a-z0-9_]{2,19}$' or v ~ '__' or v ~ '^user_[0-9a-f]{8}$' then
    return false;
  end if;
  if exists (select 1 from public.reserved_handles r where r.handle = v::extensions.citext) then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.handle = v::extensions.citext and p.id is distinct from auth.uid()) then
    return false;
  end if;
  if exists (
    select 1 from public.handle_history hh
    where hh.handle = v::extensions.citext
      and hh.released_at > now() - interval '90 days'
      and hh.user_id is distinct from auth.uid()
  ) then
    return false;
  end if;
  return true;
end
$$;

-- Sets or renames the caller's handle. First set is free; renames are limited to once per 30 days
-- and the old handle is held for 90 days (redirect + anti-impersonation).
-- Raises: not_signed_in, cooldown, unavailable.
create or replace function public.set_handle(new_handle text)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  v text := lower(btrim(coalesce(new_handle, '')));
  cur public.profiles;
  o public.profiles;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into cur from public.profiles where id = uid;
  if cur.id is null then
    raise exception 'no_profile';
  end if;
  if cur.handle::text = v then
    update public.profiles set handle_set = true where id = uid returning * into o;
    return o;
  end if;
  if cur.handle_set and cur.handle_changed_at is not null and cur.handle_changed_at > now() - interval '30 days' then
    raise exception 'cooldown';
  end if;
  if not public.is_handle_available(v) then
    raise exception 'unavailable';
  end if;
  if cur.handle_set then
    insert into public.handle_history (handle, user_id) values (cur.handle, uid);
  end if;
  update public.profiles
     set handle = v, handle_set = true, handle_changed_at = now()
   where id = uid
  returning * into o;
  return o;
end
$$;

-- Handle search for @mention autocomplete.
create or replace function public.search_handles(prefix text, max_rows int default 8)
returns table (id uuid, handle text, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id, p.handle::text, p.display_name, p.avatar_path
    from public.profiles p
   where p.handle_set
     and (p.handle::text like lower(btrim(prefix)) || '%' or p.display_name ilike btrim(prefix) || '%')
   order by p.followers_count desc, p.handle
   limit least(greatest(max_rows, 1), 20);
$$;

-- Row level security.
alter table public.profiles enable row level security;
alter table public.reserved_handles enable row level security;
alter table public.handle_history enable row level security;

create policy "profiles are public" on public.profiles
  for select using (true);
create policy "owner updates own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Only the RPCs may change handles or flags.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_path, bio, links, pronouns) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

create policy "reserved handles are readable" on public.reserved_handles
  for select using (true);
revoke insert, update, delete on public.reserved_handles from authenticated, anon;

create policy "handle history is readable" on public.handle_history
  for select using (true);
revoke insert, update, delete on public.handle_history from authenticated, anon;

grant execute on function public.is_handle_available(text) to anon, authenticated;
grant execute on function public.set_handle(text) to authenticated;
grant execute on function public.search_handles(text, int) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
