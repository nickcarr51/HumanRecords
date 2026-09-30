import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

// The signed-in user's own role, via the current_user_role() definer function
// (the role column itself is hidden from `authenticated`). null when signed
// out or on any error/throw — callers treat null as "no access".
export async function getCurrentRole(): Promise<UserRole | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("current_user_role");
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

// Page-level gate: 404s unless the caller is a label member. Layouts don't
// re-run on client (RSC) navigation, so every admin page must call this too.
export async function requireLabelMember(): Promise<void> {
  const role = await getCurrentRole();
  if (role !== "label_member") notFound();
}
