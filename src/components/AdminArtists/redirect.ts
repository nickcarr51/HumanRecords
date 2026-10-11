// A server action that calls redirect() rejects on the client with a
// NEXT_REDIRECT digest; it must propagate so Next navigates.
export function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
