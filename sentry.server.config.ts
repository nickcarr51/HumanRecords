import * as Sentry from "@sentry/nextjs";
import { errorsOnlyIntegrations } from "@/lib/observability/errors-only-integrations";
import { sentryOptions } from "@/lib/observability/sentry-options";

Sentry.init({
  ...sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, appEnv: process.env.NEXT_PUBLIC_APP_ENV }),
  integrations: errorsOnlyIntegrations,
});
