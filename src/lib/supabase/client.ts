import { createBrowserClient } from "@supabase/ssr";

// Client Components only. Safe to call anywhere in the browser — both env
// vars here are the publishable ones, meant to be exposed.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
