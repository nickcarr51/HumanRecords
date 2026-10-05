import { describe, expect, it } from "vitest";
import { sentryOptions } from "./sentry-options";

describe("sentryOptions", () => {
  it("is disabled without a DSN and defaults to local", () => {
    expect(sentryOptions({})).toMatchObject({ dsn: undefined, enabled: false, environment: "local" });
  });
  it("enables with a DSN and tags the environment", () => {
    expect(sentryOptions({ dsn: "https://k@o1.ingest.sentry.io/1", appEnv: "production" })).toMatchObject({
      enabled: true,
      environment: "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  });
  it("treats an empty DSN as missing", () => {
    expect(sentryOptions({ dsn: "" }).enabled).toBe(false);
  });
});
