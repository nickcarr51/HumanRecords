import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authUsers } from "@/lib/db/auth-schema";
import { invites, users } from "@/lib/db/generated/schema";
import { asSystem } from "@/lib/db/system";
import { pgrstTs } from "@/lib/db/timestamps";
import type { AdminListRow } from "@/lib/admin/users";
import { authorize } from "./policy";
import type { Viewer } from "./viewer";

// Every user with email + ban state (from auth.users) and invite state.
// Replaces the admin_list_users() SQL function; same columns, same order.
// Door 2 because auth.users isn't readable under RLS.
// Aliased: public.users and auth.users would otherwise both render as
// "users" ("table reference is ambiguous", verified 2026-10-24).
const au = alias(authUsers, "auth_users");

export async function listUsers(viewer: Viewer): Promise<AdminListRow[]> {
  const grant = authorize(viewer, "users.list");
  const rows = await asSystem(grant, (tx) =>
    tx
      .select({
        id: users.id,
        email: sql<string>`${au.email}::text`,
        name: users.name,
        role: users.role,
        created_at: pgrstTs(users.createdAt),
        invite_token: invites.token,
        invite_used_at: pgrstTs(invites.usedAt),
        banned_until: pgrstTs(au.bannedUntil),
      })
      .from(users)
      .innerJoin(au, eq(au.id, users.id))
      .leftJoin(invites, eq(invites.userId, users.id))
      .orderBy(desc(users.createdAt)),
  );
  // The generated AdminListRow marks name/invite_* non-null though they can be
  // null (catalog-schema functions.md); the rows match the RPC's exactly.
  return rows as AdminListRow[];
}
