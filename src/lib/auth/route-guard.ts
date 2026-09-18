const PROTECTED_PREFIXES = ["/dashboard", "/artists"];

export function authRedirectPath(pathname: string, isAuthed: boolean): string | null {
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !isAuthed) return "/login";
  // Signed-in users have no use for the public entry points (the marketing
  // splash at "/" or the login form) — send them to the dashboard.
  if ((pathname === "/login" || pathname === "/") && isAuthed) return "/dashboard";
  return null;
}
