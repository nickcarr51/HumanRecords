-- Releases: the timeline unit. A release is either a single (points at one
-- track) or an album (points at one album, which has ordered tracks). The
-- feed reads releases newest-first in one query instead of merging albums and
-- standalone tracks in memory.

create type public.release_kind as enum ('single', 'album');

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  kind public.release_kind not null,
  track_id uuid unique references public.tracks (id) on delete cascade,
  album_id uuid unique references public.albums (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint releases_kind_matches_target check (
    (kind = 'single' and track_id is not null and album_id is null)
    or (kind = 'album' and album_id is not null and track_id is null)
  )
);

create index releases_created_at_idx on public.releases (created_at desc);

alter table public.releases enable row level security;

create policy "authenticated users can read releases"
  on public.releases for select
  to authenticated
  using (true);

-- Order columns. Backfilled from current title/name order, then required.
alter table public.track_albums add column position integer;
update public.track_albums ta
set position = s.rn
from (
  select ta2.track_id, ta2.album_id,
         row_number() over (partition by ta2.album_id order by t.title, t.id) as rn
  from public.track_albums ta2
  join public.tracks t on t.id = ta2.track_id
) s
where ta.track_id = s.track_id and ta.album_id = s.album_id;
alter table public.track_albums alter column position set not null;

alter table public.track_artists add column position integer;
update public.track_artists tr
set position = s.rn
from (
  select tr2.track_id, tr2.artist_id,
         row_number() over (partition by tr2.track_id order by a.name, a.id) as rn
  from public.track_artists tr2
  join public.artists a on a.id = tr2.artist_id
) s
where tr.track_id = s.track_id and tr.artist_id = s.artist_id;
alter table public.track_artists alter column position set not null;

alter table public.album_artists add column position integer;
update public.album_artists aa
set position = s.rn
from (
  select aa2.album_id, aa2.artist_id,
         row_number() over (partition by aa2.album_id order by a.name, a.id) as rn
  from public.album_artists aa2
  join public.artists a on a.id = aa2.artist_id
) s
where aa.album_id = s.album_id and aa.artist_id = s.artist_id;
alter table public.album_artists alter column position set not null;

-- One artist per name, ignoring case and surrounding spaces. publish_release
-- relies on this for `on conflict` so a "new" artist that already exists is
-- reused instead of duplicated.
create unique index artists_name_ci_key on public.artists (lower(trim(name)));

-- Backfill releases for catalog rows that already exist (hosted develop).
insert into public.releases (kind, album_id, created_at)
select 'album', id, created_at from public.albums;

insert into public.releases (kind, track_id, created_at)
select 'single', t.id, t.created_at
from public.tracks t
where not exists (select 1 from public.track_albums ta where ta.track_id = t.id);

-- The caller's OWN role, and nothing else. public.users.role is hidden from
-- `authenticated` by a column grant (20260916140001), so the app reads it
-- through this definer function instead of selecting the column.
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

revoke execute on function public.current_user_role() from public;
revoke execute on function public.current_user_role() from anon;
grant execute on function public.current_user_role() to authenticated;
