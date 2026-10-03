import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { findUnusedInvite } from "@/lib/invites/store";
import { INVITE_TOKEN_RE } from "@/lib/invites/token";

// For the /login welcome screen. Read-only: a page load (or an email scanner
// opening the link) must never consume the token. null = show the normal form.
export async function getInviteGreeting(
  token: string | undefined,
): Promise<{ name: string | null } | null> {
  if (!token || !INVITE_TOKEN_RE.test(token)) return null;
  try {
    const db = createServiceClient();
    const invite = await findUnusedInvite(db, token);
    if (!invite) return null;
    const { data } = await db.from("users").select("name").eq("id", invite.userId).maybeSingle();
    return { name: data?.name ?? null };
  } catch (err) {
    console.error("getInviteGreeting failed", err);
    return null;
  }
}
