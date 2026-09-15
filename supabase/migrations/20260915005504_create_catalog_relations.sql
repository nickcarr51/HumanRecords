create table public.track_artists (
  track_id uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  primary key (track_id, artist_id)
);

alter table public.track_artists enable row level security;

create policy "authenticated users can read track_artists"
  on public.track_artists for select
  to authenticated
  using (true);

create table public.album_artists (
  album_id uuid not null references public.albums (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  primary key (album_id, artist_id)
);

alter table public.album_artists enable row level security;

create policy "authenticated users can read album_artists"
  on public.album_artists for select
  to authenticated
  using (true);

create table public.track_albums (
  track_id uuid not null references public.tracks (id) on delete cascade,
  album_id uuid not null references public.albums (id) on delete cascade,
  primary key (track_id, album_id)
);

alter table public.track_albums enable row level security;

create policy "authenticated users can read track_albums"
  on public.track_albums for select
  to authenticated
  using (true);

create table public.downloads (
  user_id uuid not null references public.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.downloads enable row level security;

create policy "authenticated users can read downloads"
  on public.downloads for select
  to authenticated
  using (true);

-- No insert policy yet, same as every other table (Global Constraints).
-- Recording a download is currently a service-role action; a client-side
-- insert policy is dashboard-UI work, not schema work.

-- A composite primary key only indexes lookups that start with its first
-- column. (track_id, artist_id) covers "artists on this track" but not
-- "tracks by this artist" — and the spec's own use cases need the reverse
-- direction for three of these four tables, so it's added up front rather
-- than discovered later as a slow-query bug.
create index track_artists_artist_id_idx on public.track_artists (artist_id);
create index album_artists_artist_id_idx on public.album_artists (artist_id);
create index track_albums_album_id_idx on public.track_albums (album_id);
create index downloads_track_id_idx on public.downloads (track_id);
