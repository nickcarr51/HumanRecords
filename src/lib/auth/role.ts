import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

// The signed-in user's own role, via the current_user_role() definer function
// (the role column itself is hidden from `authenticated`). null when signed
// out or on any error — callers treat null as "no access".
export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_user_role");
  if (error) return null;
  return data ?? null;
}
