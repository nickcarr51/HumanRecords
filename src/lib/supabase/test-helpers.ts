import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

// These tests create and delete real auth users and catalog rows. Refuse
// to run against anything but a local Supabase instance so a misconfigured
// NEXT_PUBLIC_SUPABASE_URL (e.g. pointed at hosted develop under future CI)
// can't turn the suite destructive.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(
    "test-helpers.ts refuses to run against a non-local Supabase URL — these tests create and delete real data.",
  );
}

export function createAnonClient(): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAdminClient(): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type TestUserRole = "listener" | "artist" | "label_member";

// No password anywhere here. Disabling auth.enable_signup blocks
// self-service *account creation* but does not disable the password
// grant type itself — a seeded/test account with a known password would
// be a real, working password-login backdoor. Tests instead exercise the
// exact OTP verification path real users go through: admin.generateLink
// issues a magic-link token without sending an email, and verifyOtp
// redeems it for a session, the same call the login UI will make.
export async function createTestUser(opts: {
  role?: TestUserRole;
  firstName?: string;
  lastName?: string;
} = {}) {
  const admin = createAdminClient();
  const email = `test-${randomUUID()}@example.com`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      role: opts.role ?? "listener",
      first_name: opts.firstName ?? "Test",
      last_name: opts.lastName ?? "User",
    },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");

  const id = data.user.id;

  async function signIn(): Promise<SupabaseClient> {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData) throw linkError ?? new Error("generateLink returned no data");

    const client = createAnonClient();
    const { error: verifyError } = await client.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
    });
    if (verifyError) throw verifyError;
    return client;
  }

  async function cleanup() {
    await admin.auth.admin.deleteUser(id);
  }

  return { id, email, signIn, cleanup };
}
