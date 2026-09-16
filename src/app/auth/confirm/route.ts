import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

// The email-confirmation types this route can be reached with (invite click,
// magic link, and email OTP). Anything else is rejected rather than cast
// straight through to verifyOtp.
const ALLOWED_OTP_TYPES: EmailOtpType[] = ["invite", "magiclink", "email"];

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = ALLOWED_OTP_TYPES.includes(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
