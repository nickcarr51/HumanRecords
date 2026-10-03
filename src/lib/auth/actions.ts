"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { claimInvite, restoreInvite, type InviteClaim } from "@/lib/invites/store";
import { INVITE_TOKEN_RE } from "@/lib/invites/token";
import { safeNextPath } from "./safe-next";

type Result = { error: string | null };

export async function requestOtp(email: string): Promise<Result> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { error: "Email is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (!error) return { error: null };

  // An uninvited email trips Supabase's invite-only guard (the exact
  // message varies by GoTrue version: "Signups not allowed for otp",
  // "User not found", etc.). Replace the raw error with invite-aware copy.
  if (/not allowed|signup|not found/i.test(error.message)) {
    return {
      error: "No invitation found for that email — Human Services is invite-only.",
    };
  }
  if (/rate|too many/i.test(error.message)) {
    return { error: "Too many attempts — wait a minute and try again." };
  }
  // Don't surface raw GoTrue wording to end users.
  return { error: "Something went wrong. Please try again." };
}

export async function submitOtp(
  email: string,
  token: string,
  next?: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) {
    return {
      error: /expired|invalid|incorrect|token/i.test(error.message)
        ? "That code is invalid or expired — request a new one."
        : "Something went wrong. Please try again.",
    };
  }
  redirect(safeNextPath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const INVITE_USED = "That link has already been used — sign in with your email below.";
const INVITE_FAILED = "Couldn't sign you in — try again, or use your email below.";

// The Enter button on the invite welcome screen. Supabase only issues a
// session after a verified login, so after claiming our single-use token we
// perform a magic-link sign-in server-side: generateLink (sends nothing) →
// verifyOtp on the cookie-bound client, which writes the session cookies.
// The Supabase hash never leaves the server.
export async function redeemInvite(token: string): Promise<Result> {
  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) return { error: INVITE_USED };

  const service = createServiceClient();
  let claim: InviteClaim | null;
  try {
    claim = await claimInvite(service, token);
  } catch (err) {
    console.error("claimInvite failed", err);
    return { error: INVITE_FAILED };
  }
  if (!claim) return { error: INVITE_USED };

  try {
    const { data: userData, error: userError } = await service.auth.admin.getUserById(claim.userId);
    const email = userData?.user?.email;
    if (userError || !email) throw userError ?? new Error("Invited user has no email");

    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !link) throw linkError ?? new Error("generateLink returned no data");

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "email",
    });
    if (verifyError) throw verifyError;
  } catch (err) {
    console.error("redeemInvite sign-in failed", err);
    try {
      await restoreInvite(service, claim, token);
    } catch (restoreErr) {
      console.error("restoreInvite failed", restoreErr);
    }
    return { error: INVITE_FAILED };
  }

  // redirect() throws to navigate; keep it outside any try/catch.
  redirect("/feed");
}
