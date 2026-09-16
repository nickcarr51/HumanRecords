"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
