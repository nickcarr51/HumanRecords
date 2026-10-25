import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authUsers } from "@/lib/db/auth-schema";
import { invites, users } from "@/lib/db/generated/schema";
import { MAX_ROWS } from "@/lib/db/max-rows";
import { asSystem } from "@/lib/db/system";
import { pgrstTs } from "@/lib/db/timestamps";
import type { UserRole } from "@/lib/auth/role";
import { authorize } from "./policy";
import type { Viewer } from "./viewer";

// Every user with email + ban state (from auth.users) and invite state.
// Replaces the admin_list_users() SQL function; same columns, same order,
// and the same 1000-row cap PostgREST applied to it (MAX_ROWS).
// Uses asSystem (admin access, RLS bypassed, only after authorize() has
// confirmed permission) because the signed-in role has no permission to read
// auth.users.
// Aliased: public.users and auth.users would otherwise both render as
// "users" ("table reference is ambiguous", verified 2026-10-24).
const au = alias(authUsers, "auth_users");

// The shape listUsers selects. name and the invite/ban columns can be null.
export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
  invite_token: string | null;
  invite_used_at: string | null;
  banned_until: string | null;
};

export async function listUsers(viewer: Viewer): Promise<UserRow[]> {
  const grant = authorize(viewer, "users.list");
  return asSystem(grant, "users.list", (tx) =>
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
      .orderBy(desc(users.createdAt))
      .limit(MAX_ROWS),
  );
}
