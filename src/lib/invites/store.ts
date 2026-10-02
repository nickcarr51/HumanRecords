// Invite-token queries. Every function takes the client explicitly (the
// data-layer DI convention) and is meant for the service-role client: the
// invites table has no grants for anon/authenticated.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

export type InviteClaim = { userId: string; usedAt: string };

// Create or regenerate: a fresh token and a cleared used_at.
export async function upsertInvite(
  db: Db,
  invite: { userId: string; token: string; createdBy: string },
): Promise<void> {
  const { error } = await db.from("invites").upsert(
    {
      user_id: invite.userId,
      token: invite.token,
      used_at: null,
      created_by: invite.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// Read-only lookup for the welcome screen. Never consumes the token.
export async function findUnusedInvite(db: Db, token: string): Promise<{ userId: string } | null> {
  if (!token) return null;
  const { data, error } = await db
    .from("invites")
    .select("user_id")
    .eq("token", token)
    .is("used_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id };
}

// Atomic single-use claim: one UPDATE … WHERE token = $1 AND used_at IS NULL.
// A concurrent second claim re-checks the WHERE after the first commits and
// matches nothing.
export async function claimInvite(db: Db, token: string): Promise<InviteClaim | null> {
  if (!token) return null;
  const usedAt = new Date().toISOString();
  const { data, error } = await db
    .from("invites")
    .update({ token: null, used_at: usedAt })
    .eq("token", token)
    .is("used_at", null)
    .select("user_id, used_at");
  if (error) throw error;
  if (!data || data.length !== 1 || !data[0].used_at) return null;
  return { userId: data[0].user_id, usedAt: data[0].used_at };
}

// Undo a claim whose sign-in failed. Matches only the exact claim, so a
// Regenerate that happened in between wins.
export async function restoreInvite(db: Db, claim: InviteClaim, token: string): Promise<void> {
  const { error } = await db
    .from("invites")
    .update({ token, used_at: null })
    .eq("user_id", claim.userId)
    .is("token", null)
    .eq("used_at", claim.usedAt);
  if (error) throw error;
}
