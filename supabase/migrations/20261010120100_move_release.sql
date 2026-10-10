-- Admin reorder: move a release one place up or down in the feed.
-- Feed order is (pinned desc, sort_at desc, id desc), so "up" is the
-- neighbour with the next-larger (sort_at, id) in the same pinned group.
-- Swapping sort_at in one function keeps the two updates atomic.

create function public.move_release(target uuid, direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.releases%rowtype;
  nb public.releases%rowtype;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can reorder releases.' using errcode = '42501';
  end if;
  if direction is null or direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = '22023';
  end if;

  select * into cur from public.releases where id = target for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if cur.archived_at is not null then
    raise exception 'Archived releases cannot be moved.' using errcode = '22023';
  end if;

  if direction = 'up' then
    select * into nb from public.releases r
    where r.pinned = cur.pinned and r.archived_at is null
      and (r.sort_at, r.id) > (cur.sort_at, cur.id)
    order by r.sort_at asc, r.id asc
    limit 1
    for update;
  else
    select * into nb from public.releases r
    where r.pinned = cur.pinned and r.archived_at is null
      and (r.sort_at, r.id) < (cur.sort_at, cur.id)
    order by r.sort_at desc, r.id desc
    limit 1
    for update;
  end if;

  if not found then
    return; -- already at the edge of its group
  end if;

  if nb.sort_at = cur.sort_at then
    -- Same timestamp: order is decided by id, so a swap changes nothing.
    -- Step just past the neighbour instead.
    update public.releases
    set sort_at = nb.sort_at + case when direction = 'up'
                                    then interval '1 microsecond'
                                    else -interval '1 microsecond' end
    where id = cur.id;
  else
    update public.releases set sort_at = nb.sort_at where id = cur.id;
    update public.releases set sort_at = cur.sort_at where id = nb.id;
  end if;
end;
$$;

revoke execute on function public.move_release(uuid, text) from public;
revoke execute on function public.move_release(uuid, text) from anon;
grant execute on function public.move_release(uuid, text) to authenticated;
