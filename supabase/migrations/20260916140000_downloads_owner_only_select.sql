-- Security fix: downloads are per-user behavioral data, not shared catalog
-- content. The original policy (using true) let any authenticated member read
-- every other member's download history. Scope reads to the owner. A separate
-- role-scoped policy (e.g. label_member analytics) can be added later if a real
-- cross-user use case appears.

drop policy "authenticated users can read downloads" on public.downloads;

create policy "users can read their own downloads"
  on public.downloads for select
  to authenticated
  using (user_id = (select auth.uid()));
