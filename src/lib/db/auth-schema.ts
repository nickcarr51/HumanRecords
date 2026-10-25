import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Only the auth.users columns the app reads. Declared by hand so the pull
// stays limited to `public`. Read only through asSystem (admin access, RLS
// bypassed, after authorize() has confirmed permission).
// Queries must alias it (alias(authUsers, "auth_users")): unaliased, Drizzle
// renders both public.users and auth.users as "users" and Postgres fails with
// "table reference \"users\" is ambiguous" (verified 2026-10-24).
export const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  bannedUntil: timestamp("banned_until", { withTimezone: true, mode: "string" }),
});
