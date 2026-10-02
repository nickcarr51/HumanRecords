import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { inviteUrl } from "@/lib/invites/url";
import type { AdminUserRow, InviteState } from "./users-types";

export type AdminListRow = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];

export function toAdminUserRow(row: AdminListRow, siteUrl: string | undefined): AdminUserRow {
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
