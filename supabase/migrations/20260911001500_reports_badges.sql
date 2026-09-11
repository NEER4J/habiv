-- Reports with auto-hide, profile badges.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam','abuse','sexual','violence','malware','copyright','broken','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(game_id, comment_id, user_id) = 1)
);
create unique index reports_once_game on public.reports (reporter_id, game_id) where game_id is not null;
create unique index reports_once_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create unique index reports_once_user on public.reports (reporter_id, user_id) where user_id is not null;
create index reports_game_recent on public.reports (game_id, created_at desc) where game_id is not null;
create index reports_open_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
create policy "signed-in users report" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "admins read reports" on public.reports for select using (public.is_admin());
create policy "admins resolve reports" on public.reports for update using (public.is_admin()) with check (public.is_admin());
revoke delete on public.reports from anon, authenticated;
revoke insert on public.reports from anon, authenticated;
grant insert (reporter_id, game_id, comment_id, user_id, reason, details) on public.reports to authenticated;

-- Five distinct reporters in 24 h hides a game pending review.
create or replace function public.reports_autohide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  creator uuid;
begin
  if new.game_id is null then return null; end if;
  select count(distinct reporter_id) into n from public.reports where game_id = new.game_id and created_at > now() - interval '24 hours';
  if n >= 5 then
    update public.games set status = 'hidden', hidden_reason = 'auto_reports'
     where id = new.game_id and status = 'published'
    returning creator_id into creator;
    if creator is not null then perform public.notify(creator, 'game_hidden', null, new.game_id, null); end if;
  end if;
  return null;
end
$$;
create trigger reports_autohide after insert on public.reports for each row execute function public.reports_autohide();

-- Admin resolution helper: resolve/dismiss and optionally restore or remove the game.
create or replace function public.resolve_report(p_report_id uuid, p_status text, p_game_action text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reports;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report_id;
  if r.id is null then raise exception 'not_found'; end if;
  update public.reports set status = p_status, resolved_by = auth.uid(), resolved_at = now() where id = p_report_id;
  if r.game_id is not null and p_game_action = 'restore' then
    update public.games set status = 'published', hidden_reason = null where id = r.game_id and status = 'hidden';
  elsif r.game_id is not null and p_game_action = 'remove' then
    update public.games set status = 'removed', hidden_reason = 'moderation' where id = r.game_id;
  end if;
  if r.comment_id is not null and p_game_action = 'remove' then
    update public.comments set deleted_at = now() where id = r.comment_id;
  end if;
  perform public.notify(r.reporter_id, 'report_resolved', null, r.game_id, r.comment_id);
end
$$;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

create table public.profile_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (badge in ('verified','founder','top_creator','staff')),
  granted_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.profile_badges enable row level security;
create policy "badges are public" on public.profile_badges for select using (true);
revoke insert, update, delete on public.profile_badges from anon, authenticated;

-- Founder: the first 100 creators to publish.
create or replace function public.grant_founder_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if (select count(*) from public.profile_badges where badge = 'founder') < 100 then
      insert into public.profile_badges (user_id, badge) values (new.creator_id, 'founder') on conflict do nothing;
    end if;
  end if;
  return null;
end
$$;
create trigger games_founder_badge after update of status on public.games for each row execute function public.grant_founder_badge();

-- Weekly top creators by 7-day plays (called from rollup_daily on Sundays).
create or replace function public.refresh_top_creator_badges()
returns void
language sql
security definer
set search_path = public
as $$
  with top as (
    select g.creator_id, sum(s.plays) plays
      from public.game_stats_5m s join public.games g on g.id = s.game_id
     where s.bucket >= now() - interval '7 days' and g.status = 'published'
     group by g.creator_id order by plays desc limit 20
  ), del as (
    delete from public.profile_badges b where b.badge = 'top_creator' and b.user_id not in (select creator_id from top) returning 1
  )
  insert into public.profile_badges (user_id, badge) select creator_id, 'top_creator' from top on conflict do nothing;
$$;
revoke execute on function public.refresh_top_creator_badges() from public, anon, authenticated;
select cron.schedule('top_creator_badges', '30 2 * * 0', $$select public.refresh_top_creator_badges()$$);
