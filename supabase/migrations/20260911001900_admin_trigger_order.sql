-- The admin-by-email trigger fired before the profile row existed (alphabetical trigger order),
-- so new admin accounts never got the flag. Grant it during profile creation instead, and keep an
-- email-change trigger that sorts after profile creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
  n text;
  adm boolean;
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
  adm := new.email is not null and exists (select 1 from public.admin_emails a where a.email = new.email::extensions.citext);
  insert into public.profiles (id, handle, display_name, is_admin)
  values (new.id, h, nullif(left(n, 40), ''), adm)
  on conflict (id) do update set is_admin = public.profiles.is_admin or excluded.is_admin;
  return new;
end
$$;

drop trigger if exists on_auth_user_admin on auth.users;
create trigger zz_on_auth_user_admin after update of email on auth.users
  for each row execute function public.grant_admin_by_email();

-- Backfill anyone already signed up with an admin email.
update public.profiles p set is_admin = true
  from auth.users u
 where u.id = p.id and u.email::extensions.citext in (select email from public.admin_emails) and not p.is_admin;
