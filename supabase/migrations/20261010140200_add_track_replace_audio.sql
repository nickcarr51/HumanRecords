-- supabase/migrations/20261010140200_add_track_replace_audio.sql
-- Release admin, part 3: add a track to a published album; replace a
-- track's MP3. Key format and object existence are checked in the server
-- action (AUDIO_KEY_RE + headObject) before these run, as for publish.

create or replace function public.add_album_track(p_release_id uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  v_track_id uuid;
  v_artist_ids uuid[];
  v_pos integer;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can add tracks.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = p_release_id for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if rel.kind <> 'album' then
    raise exception 'Tracks can only be added to albums.' using errcode = '22023';
  end if;
  if rel.archived_at is not null then
    raise exception 'This album is archived.' using errcode = '22023';
  end if;
  if coalesce(trim(payload ->> 'title'), '') = '' then
    raise exception 'Track needs a title.' using errcode = '22023';
  end if;
  if coalesce(trim(payload ->> 'audioKey'), '') = '' then
    raise exception 'Track has no audio file.' using errcode = '22023';
  end if;

  v_artist_ids := public.resolve_artist_refs(coalesce(payload -> 'artists', '[]'::jsonb));
  if cardinality(v_artist_ids) = 0 then
    raise exception 'Track needs at least one artist.' using errcode = '22023';
  end if;

  insert into public.tracks (title, audio_url)
    values (trim(payload ->> 'title'), payload ->> 'audioKey')
    returning id into v_track_id;

  insert into public.track_artists (track_id, artist_id, position)
    select v_track_id, a.id, a.ord
    from unnest(v_artist_ids) with ordinality as a (id, ord);

  -- After every existing track, live or removed.
  select coalesce(max(position), 0) + 1 into v_pos
  from public.track_albums where album_id = rel.album_id;
  insert into public.track_albums (track_id, album_id, position)
    values (v_track_id, rel.album_id, v_pos);

  return v_track_id;
end;
$$;

revoke execute on function public.add_album_track(uuid, jsonb) from public;
revoke execute on function public.add_album_track(uuid, jsonb) from anon;
grant execute on function public.add_album_track(uuid, jsonb) to authenticated;

create or replace function public.replace_track_audio(p_track_id uuid, p_audio_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trk public.tracks%rowtype;
  v_release_id uuid;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can replace files.' using errcode = '42501';
  end if;

  select id into v_release_id from public.releases where id = public.release_for_track(p_track_id) for update;
  if not found then
    raise exception 'Track not found.' using errcode = 'P0002';
  end if;
  select * into trk from public.tracks where id = p_track_id for update;
  if not found then
    raise exception 'Track not found.' using errcode = 'P0002';
  end if;
  if trk.archived_at is not null then
    raise exception 'Restore this track before replacing its file.' using errcode = '22023';
  end if;
  if coalesce(trim(p_audio_key), '') = '' then
    raise exception 'No audio file.' using errcode = '22023';
  end if;
  if p_audio_key = trk.audio_url then
    raise exception 'That file is already on this track.' using errcode = '22023';
  end if;

  insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
    values (trk.audio_url, 'replaced', 'tracks', trk.id);
  update public.tracks set audio_url = p_audio_key where id = trk.id;
end;
$$;

revoke execute on function public.replace_track_audio(uuid, text) from public;
revoke execute on function public.replace_track_audio(uuid, text) from anon;
grant execute on function public.replace_track_audio(uuid, text) to authenticated;
