import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Client Components only. Safe to call anywhere in the browser — both env
// vars here are the publishable ones, meant to be exposed.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
