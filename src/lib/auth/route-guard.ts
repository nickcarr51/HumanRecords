const PROTECTED_PREFIXES = ["/dashboard", "/artists", "/feed", "/albums"];

export function authRedirectPath(pathname: string, isAuthed: boolean): string | null {
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !isAuthed) return "/login";

  // /artists is retired from the listener MVP. Its code stays, but signed-in
  // users are bounced to the timeline so the route is effectively dark.
  if (isAuthed && (pathname === "/artists" || pathname.startsWith("/artists/"))) {
    return "/feed";
  }

  // Signed-in users have no use for the public entry points (the marketing
  // splash at "/" or the login form) — send them to the timeline.
  if ((pathname === "/login" || pathname === "/") && isAuthed) return "/feed";
  return null;
}
