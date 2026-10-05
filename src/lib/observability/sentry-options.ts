// One place for Sentry settings shared by client, server, and edge. No DSN
// (local, CI) → disabled. Errors only: tracing off to stay inside the free quota.
export function sentryOptions(env: { dsn?: string; appEnv?: string }) {
  const dsn = env.dsn || undefined;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: env.appEnv || "local",
    tracesSampleRate: 0,
    sendDefaultPii: false as const,
  };
}
