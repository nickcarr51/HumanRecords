import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
