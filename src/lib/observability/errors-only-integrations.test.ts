import { describe, expect, it } from "vitest";
import { errorsOnlyIntegrations } from "./errors-only-integrations";

describe("errorsOnlyIntegrations", () => {
  it("removes tracing and session integrations and keeps the rest", () => {
    const defaults = ["GlobalHandlers", "BrowserTracing", "BrowserSession", "ProcessSession", "Dedupe"].map((name) => ({ name }));
    expect(errorsOnlyIntegrations(defaults).map((i) => i.name)).toEqual(["GlobalHandlers", "Dedupe"]);
  });
});
