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
  return { error: error?.message ?? null };
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
  if (error) return { error: error.message };
  redirect(safeNextPath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
