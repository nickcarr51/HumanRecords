import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { asUser } from "@/lib/db/user";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/auth/role";
import { DomainError } from "./errors";

export type JwtClaims = Record<string, unknown> & { sub: string };
export type Viewer = { userId: string; role: UserRole | null; claims: JwtClaims };

// getClaims() verifies the token's signature; never trust an unverified cookie.
export async function getClaims(supabase: SupabaseClient<Database>): Promise<JwtClaims> {
  const { data } = await supabase.auth.getClaims();
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
  return { userId: claims.sub, role: row?.role ?? null, claims };
}
