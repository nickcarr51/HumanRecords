-- Admin reorder: move a release one place up or down in the feed.
-- Feed order is (pinned desc, sort_at desc, id desc), so "up" is the
-- neighbour with the next-larger (sort_at, id) in the same pinned group.
-- Swapping sort_at in one function keeps the two updates atomic.
-- Ties: the swap only works if cur and nb hold different values and no other
-- live row in the group shares either value. Fast path: one indexed EXISTS
-- checks for such a row (or cur and nb tie with each other); if neither, the
-- set of values is unchanged by the swap, no tie can appear, and exactly 2
-- rows are written. Otherwise the
-- whole pinned group is normalized first (see below), then swapped.

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

  -- Fast path: if cur and nb differ and no OTHER live row in this pinned group has sort_at equal to
  -- cur's or nb's, then cur and nb are distinct and unshared, the swap just
  -- exchanges two unique values, and nothing else needs to change.
  --
  -- Otherwise normalize the whole pinned group (live rows only) so every row
  -- sits at least 1 ms below the row above it, preserving feed order
  -- (sort_at desc, id desc). With rows numbered i = 0..n-1 in feed order,
  -- s_i the current value and d = 1 ms:
  --     v_i = min over j <= i of (s_j + j*d)  -  i*d
  -- This is a running min of (sort_at + rn*d) minus rn*d. Properties:
  --   * v_i <= s_i (j = i is in the min), so values only move down;
  --   * v_i - v_(i+1) = d + (m_i - m_(i+1)) >= d, where m_i is the running
  --     min and m_(i+1) <= m_i, hence the gap is at least d:
  --     the result is strictly decreasing, so no two rows can collide, and
  --     feed order is kept (distinct values, same sequence);
  --   * a row already >= d below the row above, and not pushed by rows
  --     above, keeps its value (v_i = s_i), and only rows with v_i <> s_i
  --     are written.
  -- The step is 1 ms because JavaScript Date keeps only milliseconds; finer
  -- gaps would collapse back into ties if sort_at is round-tripped through JS.
  -- Normalization preserves order, so nb is still adjacent to cur afterwards.
  if cur.sort_at = nb.sort_at or exists (
    select 1 from public.releases r
    where r.pinned = cur.pinned and r.archived_at is null
      and r.id not in (cur.id, nb.id)
      and r.sort_at in (cur.sort_at, nb.sort_at)
  ) then
    update public.releases r
    set sort_at = n.v
    from (
      select id, sort_at as s,
             min(sort_at + rn * interval '1 millisecond')
               over (order by sort_at desc, id desc
                     rows between unbounded preceding and current row)
               - rn * interval '1 millisecond' as v
      from (
        select id, sort_at,
               row_number() over (order by sort_at desc, id desc) - 1 as rn
        from public.releases
        where pinned = cur.pinned and archived_at is null
      ) ranked
    ) n
    where r.id = n.id and n.v <> n.s;

    select * into cur from public.releases where id = target;
    select * into nb from public.releases where id = nb.id;
  end if;

  update public.releases set sort_at = nb.sort_at where id = cur.id;
  update public.releases set sort_at = cur.sort_at where id = nb.id;
end;
$$;

revoke execute on function public.move_release(uuid, text) from public;
revoke execute on function public.move_release(uuid, text) from anon;
grant execute on function public.move_release(uuid, text) to authenticated;
