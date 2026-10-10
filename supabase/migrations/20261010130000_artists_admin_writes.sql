-- Label members manage artists from /admin/artists. Insert/update go through
-- RLS (authenticated has held table privileges on artists since creation;
-- RLS is the only gate). Delete goes through admin_delete_artist so a photo
-- key is queued for R2 cleanup in the same transaction. Add-only: deployed
-- code never writes artists. Blank names are rejected, as publish_release does.

create policy "label members insert artists"
  on public.artists for insert to authenticated
  with check (public.current_user_role() = 'label_member' and length(trim(name)) > 0);

create policy "label members update artists"
  on public.artists for update to authenticated
  using (public.current_user_role() = 'label_member')
  with check (public.current_user_role() = 'label_member' and length(trim(name)) > 0);

-- Credited artists: the track_artists/album_artists FKs are ON DELETE
-- RESTRICT (20261010120400), so the delete raises 23503 and nothing changes.
create function public.admin_delete_artist(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo text;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can delete artists.' using errcode = '42501';
  end if;

  delete from public.artists where id = target returning profile_photo_url into v_photo;
  if not found then
    raise exception 'Artist not found.' using errcode = 'P0002';
  end if;

  if v_photo is not null then
    insert into public.r2_cleanup_queue (object_key, reason, source_table, source_id)
    values (v_photo, 'archived', 'artists', target);
  end if;
end;
$$;

revoke execute on function public.admin_delete_artist(uuid) from public;
revoke execute on function public.admin_delete_artist(uuid) from anon;
grant execute on function public.admin_delete_artist(uuid) to authenticated;
