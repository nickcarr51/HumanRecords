// Placeholder copy — final email wording comes later.
const SUBJECT = "Your Human Services invite";

export function mailtoHref(email: string, url: string): string {
  const body = [
    "You're invited to Human Services, Human Records' invite-only music repository.",
    "",
    "Open this link to sign in:",
    url,
    "",
    "The link signs you in once. After that it opens the sign-in page with your email filled in.",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}
