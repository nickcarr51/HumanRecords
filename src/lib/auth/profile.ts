import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The signed-in user's display name from public.users (`name` is readable by
// `authenticated`). null when unset, signed out, or on any error — callers
// fall back to the email.
export const getOwnName = cache(async (userId: string): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    return data?.name?.trim() || null;
  } catch {
    return null;
  }
});
