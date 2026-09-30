import { notFound } from "next/navigation";
import { getCurrentRole } from "@/lib/auth/role";

// Gate for /admin and everything under it. Non-label-members get a 404, which
// the root not-found page bounces to /feed — the route's existence isn't
// revealed. Server actions are NOT covered by this layout; each admin action
// re-checks the role itself (src/lib/admin/actions.ts).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== "label_member") notFound();
  return children;
}
