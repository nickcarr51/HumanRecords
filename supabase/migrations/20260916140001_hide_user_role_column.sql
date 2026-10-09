-- Security fix: hide each member's authorization role from other members while
-- keeping display names public. RLS is row-level and can't hide a single
-- column, so use column-level privileges: authenticated members may read
-- id / first_name / last_name / created_at, but NOT role. Role is an
-- authorization attribute read server-side (the service role bypasses these
-- grants) or, later, surfaced via a JWT claim — never exposed to peers.
--
-- Emails are already private: they live in auth.users, not public.users.

revoke select on public.users from authenticated;

grant select (id, first_name, last_name, created_at)
  on public.users
  to authenticated;
