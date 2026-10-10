-- Deleting an artist must not silently strip their credits from tracks and
-- albums. Switch the artist side of the credit link tables from cascade to
-- restrict: the admin UI removes credits first. The deployed code never
-- deletes artists, so this tightening is safe in one release.

alter table public.track_artists
  drop constraint track_artists_artist_id_fkey,
  add constraint track_artists_artist_id_fkey
    foreign key (artist_id) references public.artists (id) on delete restrict;

alter table public.album_artists
  drop constraint album_artists_artist_id_fkey,
  add constraint album_artists_artist_id_fkey
    foreign key (artist_id) references public.artists (id) on delete restrict;
