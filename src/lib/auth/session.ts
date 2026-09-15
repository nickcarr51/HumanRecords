import { createClient } from "@/lib/supabase/server";

export async function getSessionUser(): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}
