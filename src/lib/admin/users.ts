import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { inviteUrl } from "@/lib/invites/url";
import { listUsers, type UserRow } from "@/lib/services/users";
import { getViewer } from "@/lib/services/viewer";
import type { AdminUserRow, InviteState } from "./users-types";

export type AdminListRow = UserRow;

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
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    // Deactivated = Supabase auth ban that hasn't expired yet.
    deactivated: row.banned_until !== null && new Date(row.banned_until) > now,
    invite,
  };
}

// Pass the cookie-bound server client: it identifies the caller, and the users
// service checks the label-member role before reading.
export async function listAdminUsers(
  db: SupabaseClient<Database>,
  siteUrl: string | undefined,
): Promise<AdminUserRow[]> {
  const rows = await listUsers(await getViewer(db));
  return rows.map((r) => toAdminUserRow(r, siteUrl));
}

// One user for /admin/users/[id]. Reuses listAdminUsers (the role check
// lives in the users service); the list is small, so filtering in TS is fine.
export async function getAdminUser(
  db: SupabaseClient<Database>,
  siteUrl: string | undefined,
  id: string,
): Promise<AdminUserRow | null> {
  if (!UUID_RE.test(id)) return null;
  const users = await listAdminUsers(db, siteUrl);
  return users.find((u) => u.id === id) ?? null;
}
