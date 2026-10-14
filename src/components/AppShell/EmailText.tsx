/**
 * An email that, when it can't fit on one line, breaks only before the "@"
 * (never mid-name). A single part longer than the line still wraps as a last
 * resort instead of overflowing.
 */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf('@');
  if (at <= 0) return <>{email}</>;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}
