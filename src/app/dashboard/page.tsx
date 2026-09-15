import { signOut } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getSessionUser();
  const email = typeof user?.email === "string" ? user.email : "unknown";

  return (
    <main>
      <h1>You&apos;re in.</h1>
      <p>Signed in as {email}.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
