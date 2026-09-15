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
create or replace function pg_temp.seed_user(
  p_email text,
  p_role public.user_role,
  p_first_name text,
  p_last_name text
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
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', p_role, 'first_name', p_first_name, 'last_name', p_last_name),
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
  v_unsigned_artist_id uuid;
  v_signed_artist_id uuid;
  v_album_id uuid;
  v_track_1_id uuid;
  v_track_2_id uuid;
begin
  v_listener_id := pg_temp.seed_user('listener@example.com', 'listener', 'Lena', 'Listener');
  v_artist_user_id := pg_temp.seed_user('artist@example.com', 'artist', 'Ada', 'Artist');
  v_label_member_id := pg_temp.seed_user('label@example.com', 'label_member', 'Lou', 'LabelMember');

  -- Unsigned artist: catalog entity with no linked account yet.
  insert into public.artists (id, name, bio) values (gen_random_uuid(), 'Unsigned Collective', 'Not yet on the platform.')
    returning id into v_unsigned_artist_id;

  -- Signed artist: linked to the seeded 'artist@example.com' account.
  insert into public.artists (id, name, bio, user_id)
    values (gen_random_uuid(), 'Ada Artist', 'Plays synths.', v_artist_user_id)
    returning id into v_signed_artist_id;

  insert into public.albums (id, title, album_art_url)
    values (gen_random_uuid(), 'Debut Sessions', 'https://placehold.co/400x400?text=Debut+Sessions')
    returning id into v_album_id;

  insert into public.tracks (id, title, audio_url, track_art_url)
    values (gen_random_uuid(), 'Opening Track', 'https://example.com/opening-track.mp3', null)
    returning id into v_track_1_id;

  insert into public.tracks (id, title, audio_url, track_art_url)
    values (gen_random_uuid(), 'Collab Cut', 'https://example.com/collab-cut.mp3', null)
    returning id into v_track_2_id;

  insert into public.track_artists (track_id, artist_id) values (v_track_1_id, v_signed_artist_id);
  insert into public.track_artists (track_id, artist_id) values (v_track_2_id, v_signed_artist_id);
  insert into public.track_artists (track_id, artist_id) values (v_track_2_id, v_unsigned_artist_id);

  insert into public.album_artists (album_id, artist_id) values (v_album_id, v_signed_artist_id);
  insert into public.track_albums (track_id, album_id) values (v_track_1_id, v_album_id);

  insert into public.downloads (user_id, track_id) values (v_listener_id, v_track_1_id);

  perform public.increment_play_count(v_track_1_id);
  perform public.increment_play_count(v_track_1_id);
  perform public.increment_play_count(v_track_2_id);
end $$;
