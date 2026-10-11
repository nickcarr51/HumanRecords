-- supabase/migrations/20261010140300_update_release.sql
-- Release admin, part 4: save the edit-page draft (titles, artists, track
-- order) in one transaction. The draft must list exactly the release's live
-- tracks; anything else means the page is stale and the save is refused.

create or replace function public.update_release(p_release_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  v_tracks jsonb := payload -> 'tracks';
  v_track jsonb;
  v_track_id uuid;
  v_live uuid[];
  v_given uuid[];
  v_artist_ids uuid[];
  v_n integer := 0;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can edit releases.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = p_release_id for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if rel.archived_at is not null then
    raise exception 'Restore this release before editing it.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_tracks) is distinct from 'array' then
    raise exception 'Tracks must be a list.' using errcode = '22023';
  end if;

  if rel.kind = 'single' then
    if payload ? 'album' then
      raise exception 'A single has no album details.' using errcode = '22023';
    end if;
    v_live := array[rel.track_id];
  else
    if coalesce(trim(payload #>> '{album,title}'), '') = '' then
      raise exception 'Album title is required.' using errcode = '22023';
    end if;
    select coalesce(array_agg(ta.track_id), '{}') into v_live
    from public.track_albums ta
    join public.tracks t on t.id = ta.track_id
    where ta.album_id = rel.album_id and t.archived_at is null;
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_given
  from jsonb_array_elements(v_tracks) as e;

  -- count(distinct) skips nulls, so a missing id also fails this check.
  if cardinality(v_given) <> cardinality(v_live)
     or (select count(distinct x) from unnest(v_given) as x) <> cardinality(v_given)
     or not (v_given @> v_live and v_live @> v_given) then
    raise exception 'This release changed since you opened it. Reload the page.' using errcode = '22023';
  end if;

  for v_track in select value from jsonb_array_elements(v_tracks) loop
    v_n := v_n + 1;
    if coalesce(trim(v_track ->> 'title'), '') = '' then
      raise exception 'Track % needs a title.', v_n using errcode = '22023';
    end if;
    v_artist_ids := public.resolve_artist_refs(coalesce(v_track -> 'artists', '[]'::jsonb));
    if cardinality(v_artist_ids) = 0 then
      raise exception 'Track % needs at least one artist.', v_n using errcode = '22023';
    end if;

    v_track_id := (v_track ->> 'id')::uuid;
    update public.tracks set title = trim(v_track ->> 'title') where id = v_track_id;
    delete from public.track_artists where track_id = v_track_id;
    insert into public.track_artists (track_id, artist_id, position)
      select v_track_id, a.id, a.ord
      from unnest(v_artist_ids) with ordinality as a (id, ord);

    if rel.kind = 'album' then
      update public.track_albums set position = v_n
      where album_id = rel.album_id and track_id = v_track_id;
    end if;
  end loop;

  if rel.kind = 'album' then
    -- Removed (archived) tracks keep their relative order, after the live ones.
    update public.track_albums ta
    set position = cardinality(v_live) + s.rn
    from (
      select ta2.track_id, row_number() over (order by ta2.position, ta2.track_id) as rn
      from public.track_albums ta2
      join public.tracks t on t.id = ta2.track_id
      where ta2.album_id = rel.album_id and t.archived_at is not null
    ) s
    where ta.album_id = rel.album_id and ta.track_id = s.track_id;

    update public.albums set title = trim(payload #>> '{album,title}') where id = rel.album_id;
    v_artist_ids := public.resolve_artist_refs(coalesce(payload #> '{album,artists}', '[]'::jsonb));
    delete from public.album_artists where album_id = rel.album_id;
    insert into public.album_artists (album_id, artist_id, position)
      select rel.album_id, a.id, a.ord
      from unnest(v_artist_ids) with ordinality as a (id, ord);
  end if;
end;
$$;

revoke execute on function public.update_release(uuid, jsonb) from public;
revoke execute on function public.update_release(uuid, jsonb) from anon;
grant execute on function public.update_release(uuid, jsonb) to authenticated;
