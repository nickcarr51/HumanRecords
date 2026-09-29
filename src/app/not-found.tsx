import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

// Next renders this only when no route matches (a true 404). A signed-in user
// who lands on an unknown path is bounced to the timeline; signed-out visitors
// get the plain 404. Uses inline styles: it renders under the root layout,
// outside the (app) shell, so it does not depend on the styled-components tree.
export default async function NotFound() {
  const user = await getSessionUser();
  if (user) redirect("/feed");
  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1>404 — Not found</h1>
    </main>
  );
}
