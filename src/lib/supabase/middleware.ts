import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirectPath } from "@/lib/auth/route-guard";
import type { Database } from "./database.types";

/**
 * Refreshes the Auth session on every matched request (see the matcher in
 * ../../middleware.ts), keeps the browser/server cookies in sync, and
 * enforces route protection: signed-out users are redirected off protected
 * routes (`/dashboard`) to `/login`, and signed-in users are redirected off
 * `/login` to `/dashboard`. See `authRedirectPath` for the exact rules.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable. Always
  // create a new one on each request.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out.
  //
  // IMPORTANT: if you remove getClaims() and use server-side rendering with
  // the Supabase client, users may be randomly logged out.
  const { data: claimsData } = await supabase.auth.getClaims();
  const redirectTo = authRedirectPath(request.nextUrl.pathname, Boolean(claimsData?.claims));
  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    // When bouncing a signed-out user off a protected route, remember where
    // they were headed so login can send them back there.
    if (redirectTo === "/login") {
      url.searchParams.set("next", request.nextUrl.pathname);
    }
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie),
    );
    return redirectResponse;
  }

  // IMPORTANT: you *must* return the supabaseResponse object as it is. If
  // you're creating a new response object with NextResponse.next() make
  // sure to:
  // 1. Pass the request in it: NextResponse.next({ request })
  // 2. Copy over the cookies: myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing the cookies
  // 4. Return myNewResponse
  // Otherwise the browser and server can go out of sync and terminate the
  // user's session prematurely.
  return supabaseResponse;
}
