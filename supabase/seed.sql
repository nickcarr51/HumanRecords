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

  -- Bulk demo catalog so browse/search/pagination have real volume locally.
  -- Names are varied so ILIKE search returns partial matches; ~40% get a
  -- placeholder photo so both the photo and initials-tile paths render.
  declare
    v_names text[] := array[
      'Midnight Ledger','Cass Vetiver','The Owl Hours','Nadia Br?ne','Slow Transit',
      'Ivory Pipeline','Juno Cassette','Halden Frost','The Paper Kites Cover','Mara Sol',
      'Echo Foundry','Vesper Lane','Kingsley Ono','Tundra Mail','Little Ghost Radio',
      'August Pryce','The Blue Ferns','Odalys','North of Neon','Sable & Stone',
      'Rue Delacroix','Piano for Wolves','Tempo Moon','Cedar Halls','Wren Adair',
      'The Static Sea','Loam','Mirror Falls','Quiet Company Lines','Aster Vale'
    ];
    v_artist_ids uuid[] := '{}';
    v_new_artist uuid;
    v_new_track uuid;
    v_new_album uuid;
    i int;
    j int;
    v_photo text;
  begin
    for i in 1 .. array_length(v_names, 1) loop
      v_photo := case when i % 5 < 2
        then format('https://placehold.co/200x200?text=%s', left(v_names[i], 12))
        else null end;
      insert into public.artists (id, name, bio, profile_photo_url)
        values (
          gen_random_uuid(),
          v_names[i],
          format('%s is part of the Human Records vault. Placeholder bio.', v_names[i]),
          v_photo
        )
        returning id into v_new_artist;
      v_artist_ids := v_artist_ids || v_new_artist;

      -- Give each artist an album and 0-3 tracks (i % 4 tracks) so detail
      -- pages vary, including artists with an empty track list.
      insert into public.albums (id, title, album_art_url)
        values (gen_random_uuid(), format('%s LP', v_names[i]),
                format('https://placehold.co/400x400?text=%s', left(v_names[i], 10)))
        returning id into v_new_album;
      insert into public.album_artists (album_id, artist_id) values (v_new_album, v_new_artist);

      for j in 1 .. (i % 4) loop
        insert into public.tracks (id, title, audio_url, track_art_url)
          values (gen_random_uuid(), format('%s - Track %s', v_names[i], j),
                  format('https://example.com/%s-%s.mp3', i, j), null)
          returning id into v_new_track;
        insert into public.track_artists (track_id, artist_id) values (v_new_track, v_new_artist);
        insert into public.track_albums (track_id, album_id) values (v_new_track, v_new_album);
        perform public.increment_play_count(v_new_track);
      end loop;
    end loop;
  end;
end $$;
