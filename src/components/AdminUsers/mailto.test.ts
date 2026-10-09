import { describe, expect, it } from "vitest";
import { mailtoHref } from "./mailto";

describe("mailtoHref", () => {
  it("addresses the user and carries the invite URL in the body", () => {
    const url = "http://127.0.0.1:3000/login?email=a%40b.co&invite=tok";
    const href = mailtoHref("a@b.co", url);
    expect(href.startsWith("mailto:a@b.co?")).toBe(true);
    const params = new URLSearchParams(href.split("?").slice(1).join("?"));
    expect(params.get("subject")).toBe("Your Human Services invite");
    expect(params.get("body")).toContain(url);
  });
});
