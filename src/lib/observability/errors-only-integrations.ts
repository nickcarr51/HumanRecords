// Integrations Sentry enables by default that send non-error data (tracing
// spans, release-health session envelopes). Removed to keep us errors-only.
// Names verified in node_modules/@sentry/browser (BrowserTracing, BrowserSession)
// and node_modules/@sentry/node (ProcessSession).
const NON_ERROR_INTEGRATIONS = ["BrowserTracing", "BrowserSession", "ProcessSession"];

export function errorsOnlyIntegrations<T extends { name: string }>(defaults: T[]): T[] {
  return defaults.filter((i) => !NON_ERROR_INTEGRATIONS.includes(i.name));
}
