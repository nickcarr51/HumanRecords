// The link written to NFC cards and pasted into emails. Always built on
// SITE_URL (never the request host) so a card written during local testing
// can't silently point somewhere else.
export function inviteUrl(
  email: string,
  token: string,
  siteUrl: string | undefined = process.env.SITE_URL,
): string {
  if (!siteUrl) throw new Error("SITE_URL is not set — invite links can't be built.");
  const url = new URL("/login", siteUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("invite", token);
  return url.toString();
}
