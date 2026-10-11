// Server-only helper for admin server actions (deliberately not "use server":
// it must not be callable from the client).
import { getCurrentRole } from "@/lib/auth/role";
import { createClient } from "@/lib/supabase/server";

// The caller's user id if they are a label member whose account is still
// active, else null. getCurrentRole() alone isn't enough: current_user_role()
// ignores bans, so a deactivated label member's old access token keeps passing
// it for up to an hour. getUser() (not getClaims(), which only verifies the
// JWT locally) asks the auth server, which rejects banned users
// (user_banned), so a ban takes effect immediately for admin actions.
export async function activeLabelMemberId(): Promise<string | null> {
  if ((await getCurrentRole()) !== "label_member") return null;
  try {
    const { data, error } = await (await createClient()).auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
