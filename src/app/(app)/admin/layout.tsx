import { requireLabelMember } from "@/lib/auth/role";

// Gate for /admin and everything under it. Non-label-members get a 404, which
// the root not-found page bounces to /feed — the route's existence isn't
// revealed. Layouts do NOT re-run on client navigation (partial rendering can
// render a child page without this layout), so every admin page must ALSO call
// requireLabelMember() at its top. Server actions are not covered either; each
// admin action re-checks the role itself (src/lib/admin/actions.ts).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireLabelMember();
  return children;
}
