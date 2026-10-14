import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentRole } from "@/lib/auth/role";
import { getOwnName } from "@/lib/auth/profile";
import { AppShell } from "@/components";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const userId = typeof user.sub === "string" ? user.sub : null;
  const email = typeof user.email === "string" ? user.email : null;
  const [role, name] = await Promise.all([
    getCurrentRole(),
    userId ? getOwnName(userId) : Promise.resolve(null),
  ]);
  return (
    <AppShell isLabelMember={role === "label_member"} account={{ name, email }}>
      {children}
    </AppShell>
  );
}
