import { describe, expect, it } from "vitest";
import { parsePage } from "./params";

describe("parsePage", () => {
  it("defaults junk, zero and negatives to 1 and floors decimals", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.5")).toBe(2);
    expect(parsePage("4")).toBe(4);
  });

  it("sends exponent, non-finite and over-cap values to page 1", () => {
    expect(parsePage("1e22")).toBe(1);
    expect(parsePage("100001")).toBe(1);
    expect(parsePage("100000")).toBe(100000);
    expect(parsePage("NaN")).toBe(1);
    expect(parsePage("Infinity")).toBe(1);
  });
});
