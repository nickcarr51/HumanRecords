import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Auth session on every matched request (see the matcher in
 * ../../middleware.ts) and keeps the browser/server cookies in sync.
 *
 * No route-protection logic here yet — there's no login flow or dashboard
 * to protect. This just keeps sessions alive; redirect-when-signed-out
 * rules land with the dashboard/auth UI work.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable. Always
  // create a new one on each request.
  const supabase = createServerClient(
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
  await supabase.auth.getClaims();

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
