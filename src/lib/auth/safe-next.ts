/**
 * Returns a safe same-origin destination path, defaulting to "/dashboard".
 *
 * Guards against open redirects: only an absolute path on this origin is
 * accepted — it must start with a single "/" and must not begin with "//"
 * or "/\", both of which a browser can treat as a protocol-relative,
 * cross-origin URL once it lands in a Location header.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}
