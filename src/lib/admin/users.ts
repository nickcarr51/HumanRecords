import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { inviteUrl } from "@/lib/invites/url";
import type { AdminUserRow, InviteState } from "./users-types";

export type AdminListRow = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toAdminUserRow(row: AdminListRow, siteUrl: string | undefined, now: Date = new Date()): AdminUserRow {
  let invite: InviteState = { status: "none" };
  if (row.invite_used_at) {
    invite = { status: "used", usedAt: row.invite_used_at };
  } else if (row.invite_token) {
    invite = { status: "unused", url: inviteUrl(row.email, row.invite_token, siteUrl) };
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    createdAt: row.created_at,
    // Deactivated = Supabase auth ban that hasn't expired yet.
    deactivated: row.banned_until !== null && new Date(row.banned_until) > now,
    invite,
  };
}

// Pass the cookie-bound server client: admin_list_users checks the caller's
// role inside Postgres.
export async function listAdminUsers(
  db: SupabaseClient<Database>,
  siteUrl: string | undefined,
): Promise<AdminUserRow[]> {
  const { data, error } = await db.rpc("admin_list_users");
  if (error) throw error;
  return (data ?? []).map((r) => toAdminUserRow(r, siteUrl));
}

// One user for /admin/users/[id]. Reuses admin_list_users (the role check
// lives in Postgres); the list is small, so filtering in TS is fine.
export async function getAdminUser(
  db: SupabaseClient<Database>,
  siteUrl: string | undefined,
  id: string,
): Promise<AdminUserRow | null> {
  if (!UUID_RE.test(id)) return null;
  const users = await listAdminUsers(db, siteUrl);
  return users.find((u) => u.id === id) ?? null;
}
