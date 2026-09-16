const PROTECTED_PREFIXES = ["/dashboard"];

export function authRedirectPath(pathname: string, isAuthed: boolean): string | null {
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !isAuthed) return "/login";
  if (pathname === "/login" && isAuthed) return "/dashboard";
  return null;
}
