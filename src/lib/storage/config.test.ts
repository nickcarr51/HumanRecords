import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getR2Config } from "./config";

const KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    process.env[k] = `val-${k}`;
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getR2Config", () => {
  it("returns all five values when present", () => {
    const cfg = getR2Config();
    expect(cfg.accountId).toBe("val-R2_ACCOUNT_ID");
    expect(cfg.accessKeyId).toBe("val-R2_ACCESS_KEY_ID");
    expect(cfg.secretAccessKey).toBe("val-R2_SECRET_ACCESS_KEY");
    expect(cfg.bucket).toBe("val-R2_BUCKET_NAME");
    expect(cfg.endpoint).toBe("val-R2_ENDPOINT");
  });

  it("throws naming any missing var", () => {
    delete process.env.R2_ENDPOINT;
    expect(() => getR2Config()).toThrow(/R2_ENDPOINT/);
  });
});
