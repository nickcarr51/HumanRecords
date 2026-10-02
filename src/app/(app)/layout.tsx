import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentRole } from "@/lib/auth/role";
import { AppShell } from "@/components";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  return <AppShell isLabelMember={role === "label_member"}>{children}</AppShell>;
}
