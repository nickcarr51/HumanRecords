-- supabase/migrations/20261010140100_archive_restore_track.sql
-- Release admin, part 2: remove (archive) / restore one album track.
-- Removing the album's last live track archives the release too, with the
-- same timestamp, so the feed never shows an empty album and restoring the
-- album brings that track back.

create or replace function public.archive_track(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  trk public.tracks%rowtype;
  v_at timestamptz := now();
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can remove tracks.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = public.release_for_track(p_track_id) for update;
  if not found then
    raise exception 'Track not found.' using errcode = 'P0002';
  end if;
  if rel.kind = 'single' then
    raise exception 'Archive the single instead.' using errcode = '22023';
  end if;
  if rel.archived_at is not null then
    raise exception 'This album is archived.' using errcode = '22023';
  end if;

  select * into trk from public.tracks where id = p_track_id for update;
  if trk.archived_at is not null then
    return;
  end if;

  update public.tracks set archived_at = v_at where id = trk.id;
  insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
  select k.key, 'archived', 'tracks', trk.id
  from (values (trk.audio_url), (trk.track_art_url)) as k (key)
  where k.key is not null;

  if not exists (
    select 1 from public.track_albums ta
    join public.tracks t on t.id = ta.track_id
    where ta.album_id = rel.album_id and t.archived_at is null
  ) then
    update public.releases set archived_at = v_at where id = rel.id;
    insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
    select al.album_art_url, 'archived', 'albums', al.id
    from public.albums al
    where al.id = rel.album_id and al.album_art_url is not null;
  end if;
end;
$$;

revoke execute on function public.archive_track(uuid) from public;
revoke execute on function public.archive_track(uuid) from anon;
grant execute on function public.archive_track(uuid) to authenticated;

create or replace function public.restore_track(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel public.releases%rowtype;
  trk public.tracks%rowtype;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can restore tracks.' using errcode = '42501';
  end if;

  select * into rel from public.releases where id = public.release_for_track(p_track_id) for update;
  if not found then
    raise exception 'Track not found.' using errcode = 'P0002';
  end if;
  if rel.kind = 'single' then
    raise exception 'Restore the single instead.' using errcode = '22023';
  end if;
  if rel.archived_at is not null then
    raise exception 'Restore the album first.' using errcode = '22023';
  end if;

  select * into trk from public.tracks where id = p_track_id for update;
  if trk.archived_at is null then
    return;
  end if;

  if exists (
    select 1 from public.r2_cleanup_queue q
    where q.reason = 'archived' and q.cleaned_at is not null
      and q.source_table = 'tracks' and q.source_id = trk.id
  ) then
    raise exception 'This track''s file was already deleted from storage.' using errcode = '22023';
  end if;

  update public.tracks set archived_at = null where id = trk.id;
  delete from public.r2_cleanup_queue q
  where q.reason = 'archived' and q.cleaned_at is null
    and q.source_table = 'tracks' and q.source_id = trk.id;
end;
$$;

revoke execute on function public.restore_track(uuid) from public;
revoke execute on function public.restore_track(uuid) from anon;
grant execute on function public.restore_track(uuid) to authenticated;
