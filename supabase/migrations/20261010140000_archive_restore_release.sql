-- Release admin, part 1: archive / restore a whole release atomically.
-- Archiving a release archives its live tracks with the SAME timestamp, so
-- stream/download (which only check the track) refuse them too, and restore
-- can tell "archived with the release" apart from "removed earlier".
-- Keys are queued in r2_cleanup_queue as candidates for a future cleanup job.

-- Internal: the release that owns a track (a single's track or an album
-- track). Not callable through the API.
create or replace function public.release_for_track(p_track_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(distinct x.id) into v_ids
  from (
    select r.id from public.releases r where r.track_id = p_track_id
    union all
    select r.id from public.releases r
      join public.track_albums ta on ta.album_id = r.album_id
      where ta.track_id = p_track_id
  ) x;
  if coalesce(array_length(v_ids, 1), 0) > 1 then
    raise exception 'This track belongs to more than one release.' using errcode = '22023';
  end if;
  return v_ids[1]; -- null when the track has no release
end;
$$;

revoke execute on function public.release_for_track(uuid) from public;
revoke execute on function public.release_for_track(uuid) from anon;
revoke execute on function public.release_for_track(uuid) from authenticated;

create or replace function public.archive_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  v_at timestamptz := now();
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can archive releases.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = p_release_id for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if rel.archived_at is not null then
    return; -- already archived: a double click is harmless
  end if;

  -- Refuse the ambiguous case: archived_at is per track, so a track also shown
  -- by another release can't be archived/restored with just this one.
  if exists (
    select 1
    from (
      select rel.track_id as tid where rel.kind = 'single'
      union all
      select ta.track_id from public.track_albums ta
        where rel.kind = 'album' and ta.album_id = rel.album_id
    ) mine
    where exists (
      select 1 from public.releases r2
      where r2.id <> rel.id
        and (r2.track_id = mine.tid
          or r2.album_id in (select ta2.album_id from public.track_albums ta2 where ta2.track_id = mine.tid))
    )
  ) then
    raise exception 'A track on this release also belongs to another release.' using errcode = '22023';
  end if;

  update public.releases set archived_at = v_at where id = rel.id;

  with archived as (
    update public.tracks t set archived_at = v_at
    where t.archived_at is null
      and t.id in (
        select rel.track_id where rel.kind = 'single'
        union all
        select ta.track_id from public.track_albums ta
          where rel.kind = 'album' and ta.album_id = rel.album_id
      )
    returning t.id, t.audio_url, t.track_art_url
  )
  insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
  select k.key, 'archived', 'tracks', a.id
  from archived a
  cross join lateral (values (a.audio_url), (a.track_art_url)) as k (key)
  where k.key is not null;

  if rel.kind = 'album' then
    insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
    select al.album_art_url, 'archived', 'albums', al.id
    from public.albums al
    where al.id = rel.album_id and al.album_art_url is not null;
  end if;
end;
$$;

revoke execute on function public.archive_release(uuid) from public;
revoke execute on function public.archive_release(uuid) from anon;
grant execute on function public.archive_release(uuid) to authenticated;

create or replace function public.restore_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  v_track_ids uuid[];
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can restore releases.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = p_release_id for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if rel.archived_at is null then
    return;
  end if;

  -- Refuse the ambiguous case: archived_at is per track, so a track also shown
  -- by another release can't be archived/restored with just this one.
  if exists (
    select 1
    from (
      select rel.track_id as tid where rel.kind = 'single'
      union all
      select ta.track_id from public.track_albums ta
        where rel.kind = 'album' and ta.album_id = rel.album_id
    ) mine
    where exists (
      select 1 from public.releases r2
      where r2.id <> rel.id
        and (r2.track_id = mine.tid
          or r2.album_id in (select ta2.album_id from public.track_albums ta2 where ta2.track_id = mine.tid))
    )
  ) then
    raise exception 'A track on this release also belongs to another release.' using errcode = '22023';
  end if;

  -- Only tracks archived together with the release (same timestamp).
  select coalesce(array_agg(t.id), '{}') into v_track_ids
  from public.tracks t
  where t.archived_at = rel.archived_at
    and t.id in (
      select rel.track_id where rel.kind = 'single'
      union all
      select ta.track_id from public.track_albums ta
        where rel.kind = 'album' and ta.album_id = rel.album_id
    );

  if exists (
    select 1 from public.r2_cleanup_queue q
    where q.reason = 'archived' and q.cleaned_at is not null
      and ((q.source_table = 'tracks' and q.source_id = any (v_track_ids))
        or (q.source_table = 'albums' and q.source_id = rel.album_id))
  ) then
    raise exception 'Some files for this release were already deleted from storage; it can''t be restored.'
      using errcode = '22023';
  end if;

  update public.releases set archived_at = null where id = rel.id;
  update public.tracks set archived_at = null where id = any (v_track_ids);

  delete from public.r2_cleanup_queue q
  where q.reason = 'archived' and q.cleaned_at is null
    and ((q.source_table = 'tracks' and q.source_id = any (v_track_ids))
      or (q.source_table = 'albums' and q.source_id = rel.album_id));
end;
$$;

revoke execute on function public.restore_release(uuid) from public;
revoke execute on function public.restore_release(uuid) from anon;
grant execute on function public.restore_release(uuid) to authenticated;
