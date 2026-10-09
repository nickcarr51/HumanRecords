-- The single write path for publishing a release. Everything happens inside
-- this function's implicit transaction: any raise rolls back every insert.
-- security definer lets it write to catalog tables that have no insert
-- policies; the role check at the top is the gate.

-- Resolves a JSON array of artist refs ({id} or {newName}) to artist ids, in
-- order, without duplicates. A newName that matches an existing artist
-- case-insensitively reuses that row (artists_name_ci_key). Internal helper:
-- not callable through the API.
create function public.resolve_artist_refs(refs jsonb)
returns uuid[]
language plpgsql
set search_path = public
as $$
declare
  v_ref jsonb;
  v_id uuid;
  v_name text;
  v_ids uuid[] := '{}';
begin
  if jsonb_typeof(refs) is distinct from 'array' then
    raise exception 'artists must be a list' using errcode = '22023';
  end if;

  for v_ref in select value from jsonb_array_elements(refs) loop
    if v_ref ? 'id' then
      select id into v_id from artists where id = (v_ref ->> 'id')::uuid;
      if v_id is null then
        raise exception 'Unknown artist.' using errcode = '22023';
      end if;
    elsif v_ref ? 'newName' then
      v_name := trim(v_ref ->> 'newName');
      if coalesce(v_name, '') = '' then
        raise exception 'Artist name is empty.' using errcode = '22023';
      end if;
      insert into artists (name) values (v_name)
        on conflict ((lower(trim(name)))) do nothing;
      select id into v_id from artists where lower(trim(name)) = lower(v_name);
    else
      raise exception 'Artist must have an id or a newName.' using errcode = '22023';
    end if;

    if not (v_id = any (v_ids)) then
      v_ids := v_ids || v_id;
    end if;
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.resolve_artist_refs(jsonb) from public;
revoke execute on function public.resolve_artist_refs(jsonb) from anon;
revoke execute on function public.resolve_artist_refs(jsonb) from authenticated;

create function public.publish_release(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.release_kind;
  v_tracks jsonb := payload -> 'tracks';
  v_track jsonb;
  v_track_id uuid;
  v_track_ids uuid[] := '{}';
  v_artist_ids uuid[];
  v_album_id uuid;
  v_release_id uuid;
  v_n integer := 0;
begin
  -- 1. Only label members may publish.
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can publish releases.' using errcode = '42501';
  end if;

  -- 2. Shape checks.
  v_kind := (payload ->> 'kind')::public.release_kind;
  if v_kind is null then
    raise exception 'Release kind is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_tracks) is distinct from 'array' then
    raise exception 'Tracks must be a list.' using errcode = '22023';
  end if;
  if v_kind = 'single' then
    if jsonb_array_length(v_tracks) <> 1 then
      raise exception 'A single has exactly one track.' using errcode = '22023';
    end if;
    if payload ? 'album' then
      raise exception 'A single has no album details.' using errcode = '22023';
    end if;
  else
    if jsonb_array_length(v_tracks) < 2 then
      raise exception 'An album needs at least 2 tracks.' using errcode = '22023';
    end if;
    if coalesce(trim(payload #>> '{album,title}'), '') = '' then
      raise exception 'Album title is required.' using errcode = '22023';
    end if;
  end if;

  -- 3. Tracks, in order, each with ordered artist credits.
  for v_track in select value from jsonb_array_elements(v_tracks) loop
    v_n := v_n + 1;
    if coalesce(trim(v_track ->> 'title'), '') = '' then
      raise exception 'Track % needs a title.', v_n using errcode = '22023';
    end if;
    if coalesce(trim(v_track ->> 'audioKey'), '') = '' then
      raise exception 'Track % has no audio file.', v_n using errcode = '22023';
    end if;

    v_artist_ids := public.resolve_artist_refs(coalesce(v_track -> 'artists', '[]'::jsonb));
    if cardinality(v_artist_ids) = 0 then
      raise exception 'Track % needs at least one artist.', v_n using errcode = '22023';
    end if;

    insert into tracks (title, audio_url)
      values (trim(v_track ->> 'title'), v_track ->> 'audioKey')
      returning id into v_track_id;

    insert into track_artists (track_id, artist_id, position)
      select v_track_id, a.id, a.ord
      from unnest(v_artist_ids) with ordinality as a (id, ord);

    v_track_ids := v_track_ids || v_track_id;
  end loop;

  -- 4. Album (album releases only) + 5. the release row.
  if v_kind = 'album' then
    insert into albums (title)
      values (trim(payload #>> '{album,title}'))
      returning id into v_album_id;

    v_artist_ids := public.resolve_artist_refs(coalesce(payload #> '{album,artists}', '[]'::jsonb));
    insert into album_artists (album_id, artist_id, position)
      select v_album_id, a.id, a.ord
      from unnest(v_artist_ids) with ordinality as a (id, ord);

    insert into track_albums (track_id, album_id, position)
      select t.id, v_album_id, t.ord
      from unnest(v_track_ids) with ordinality as t (id, ord);

    insert into releases (kind, album_id) values ('album', v_album_id)
      returning id into v_release_id;
  else
    insert into releases (kind, track_id) values ('single', v_track_ids[1])
      returning id into v_release_id;
  end if;

  return v_release_id;
end;
$$;

revoke execute on function public.publish_release(jsonb) from public;
revoke execute on function public.publish_release(jsonb) from anon;
grant execute on function public.publish_release(jsonb) to authenticated;
