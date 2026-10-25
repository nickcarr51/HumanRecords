import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { asUser } from "@/lib/db/user";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/auth/role";
import { DomainError } from "./errors";

// A type-only marker: no value carries it, so code outside getClaims() can't
// write JwtClaims without a cast (yarn typecheck catches that).
declare const verifiedOnly: unique symbol;
// Verified JWT claims. Only getClaims() may create one.
export type JwtClaims = Record<string, unknown> & { sub: string; readonly [verifiedOnly]: true };
export type Viewer = { userId: string; role: UserRole | null; claims: JwtClaims };

// Every Viewer getViewer() has returned. authorize() rejects any other object.
const issued = new WeakSet<object>();

// True only for a Viewer that getViewer() returned.
export function isIssuedViewer(viewer: Viewer): boolean {
  return issued.has(viewer);
}

// getClaims() verifies the token's signature; never trust an unverified cookie.
// When the auth library reports an error (e.g. the auth server can't be
// reached), one line with only the error's name and HTTP status is logged,
// never the token or the message, and the caller still gets UNAUTHENTICATED.
export async function getClaims(supabase: SupabaseClient<Database>): Promise<JwtClaims> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    const status: unknown = Reflect.get(error, "status");
    console.error(`Session check failed: ${error.name} (status ${status ?? "none"})`);
  }
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (!claims || typeof claims.sub !== "string") {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return claims as JwtClaims;
}

// Role comes from the database: admin_set_user_role updates public.users but
// not app_metadata, so the JWT's copy can be stale.
export async function getViewer(supabase: SupabaseClient<Database>): Promise<Viewer> {
  const claims = await getClaims(supabase);
  const [row] = await asUser(claims, (tx) =>
    tx.execute<{ role: UserRole | null }>(sql`select public.current_user_role() as role`),
  );
  const viewer: Viewer = { userId: claims.sub, role: row?.role ?? null, claims };
  issued.add(viewer);
  return viewer;
}
