-- supabase/seed.sql
-- Local development only. Never run this against a hosted project — use
-- the admin API (inviteUserByEmail / admin.createUser) there instead.

create extension if not exists "pgcrypto";

-- Creates a fake auth.users + auth.identities row and returns its id so
-- the caller can attach catalog rows to it. encrypted_password is set to
-- an unknown random value, not a memorable one — this project is OTP-only,
-- so a seed account must not double as a working password-login backdoor
-- (disabling auth.enable_signup blocks new self-service accounts, it does
-- not disable the password grant type for accounts that have one set).
-- To sign in as a seeded user locally, use the real product flow: trigger
-- email OTP for their address from the app and read the code from Mailpit
-- at http://127.0.0.1:54324.
-- A real (not pg_temp) schema so supabase/seed.local.sql, which may run in
-- a separate session, can call the same helper. Local DB only.
create schema if not exists seed_helpers;
create or replace function seed_helpers.seed_user(
  p_email text,
  p_role public.user_role,
  p_name text
) returns uuid
language plpgsql
as $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role),
    jsonb_build_object('name', p_name),
    now(),
    now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    format('{"sub": "%s", "email": "%s"}', v_user_id, p_email)::jsonb,
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  return v_user_id;
end;
$$;

do $$
declare
  v_listener_id uuid;
  v_artist_user_id uuid;
  v_label_member_id uuid;
  v_artist_castillonaire uuid;
  v_artist_sawcy uuid;
  v_artist_quinoa uuid;
  v_artist_daye uuid;
  v_album_id uuid;
  v_album_track_1 uuid;
  v_album_track_2 uuid;
  v_single_id uuid;
begin
  v_listener_id := seed_helpers.seed_user('listener@example.com', 'listener', 'Lena Listener');
  v_artist_user_id := seed_helpers.seed_user('artist@example.com', 'artist', 'Ada Artist');
  v_label_member_id := seed_helpers.seed_user('label@example.com', 'label_member', 'Lou LabelMember');

  -- Four artists. Track 1 is credited to two of them (Castillonaire & Sawcy),
  -- which the many-to-many track_artists table supports directly.
  insert into public.artists (id, name, bio)
    values (gen_random_uuid(), 'Castillonaire', 'Human Records artist.')
    returning id into v_artist_castillonaire;
  insert into public.artists (id, name, bio)
    values (gen_random_uuid(), 'Sawcy', 'Human Records artist.')
    returning id into v_artist_sawcy;
  insert into public.artists (id, name, bio)
    values (gen_random_uuid(), 'Quinoa Jones', 'Human Records artist.')
    returning id into v_artist_quinoa;
  insert into public.artists (id, name, bio)
    values (gen_random_uuid(), 'Daye', 'Human Records artist.')
    returning id into v_artist_daye;

  -- Album "The Breaks" with two tracks. audio_url holds the R2 OBJECT KEY
  -- (tracks/<uuid>.mp3, same shape as admin uploads), not a URL. Upload the
  -- files to the local bucket with `yarn r2:seed-local` (scripts/lib/r2-local.mts).
  insert into public.albums (id, title, album_art_url, created_at)
    values (gen_random_uuid(), 'The Breaks', null, now() - interval '1 hour')
    returning id into v_album_id;

  insert into public.tracks (id, title, audio_url, track_art_url, created_at)
    values (gen_random_uuid(), 'ASSUMPTIONS', 'tracks/5e3c1a2b-7d4e-4f60-9a1b-2c3d4e5f6a71.mp3', null, now() - interval '1 hour')
    returning id into v_album_track_1;
  insert into public.tracks (id, title, audio_url, track_art_url, created_at)
    values (gen_random_uuid(), 'JERK CLUB TOOL', 'tracks/8f2a6b1c-3e4d-4a5b-8c6d-7e8f9a0b1c22.mp3', null, now() - interval '1 hour')
    returning id into v_album_track_2;

  -- One standalone track, published below as a single release.
  -- Newer timestamp so it sorts above the album in the timeline.
  insert into public.tracks (id, title, audio_url, track_art_url, created_at)
    values (gen_random_uuid(), 'LET EM KNOW', 'tracks/c41d7e9f-2a3b-4c5d-b6e7-f8091a2b3c43.mp3', null, now())
    returning id into v_single_id;

  -- Credit artists to tracks: ASSUMPTIONS -> Castillonaire + Sawcy,
  -- JERK CLUB TOOL -> Quinoa Jones, LET EM KNOW -> Daye.
  insert into public.track_artists (track_id, artist_id, position) values (v_album_track_1, v_artist_castillonaire, 1);
  insert into public.track_artists (track_id, artist_id, position) values (v_album_track_1, v_artist_sawcy, 2);
  insert into public.track_artists (track_id, artist_id, position) values (v_album_track_2, v_artist_quinoa, 1);
  insert into public.track_artists (track_id, artist_id, position) values (v_single_id, v_artist_daye, 1);

  -- Album membership + album credit (the three artists who appear on it).
  insert into public.album_artists (album_id, artist_id, position) values (v_album_id, v_artist_castillonaire, 1);
  insert into public.album_artists (album_id, artist_id, position) values (v_album_id, v_artist_sawcy, 2);
  insert into public.album_artists (album_id, artist_id, position) values (v_album_id, v_artist_quinoa, 3);
  insert into public.track_albums (track_id, album_id, position) values (v_album_track_1, v_album_id, 1);
  insert into public.track_albums (track_id, album_id, position) values (v_album_track_2, v_album_id, 2);

  -- Timeline entries: the album as one release, the standalone track as a
  -- single. created_at mirrors the catalog rows so ordering is unchanged.
  insert into public.releases (kind, album_id, created_at) values ('album', v_album_id, now() - interval '1 hour');
  insert into public.releases (kind, track_id, created_at) values ('single', v_single_id, now());

  -- A little activity so downloads/play_count are non-empty locally.
  insert into public.downloads (user_id, track_id) values (v_listener_id, v_single_id);
  perform public.increment_play_count(v_single_id);
  perform public.increment_play_count(v_album_track_1);
end $$;
