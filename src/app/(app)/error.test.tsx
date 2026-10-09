import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "@/test/renderWithTheme";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (e: unknown) => captureException(e) }));

import AppError from "./error";

describe("AppError", () => {
  it("reports the error to Sentry", () => {
    const err = new Error("boom");
    renderWithTheme(<AppError error={err} reset={() => {}} />);
    expect(captureException).toHaveBeenCalledWith(err);
  });
});
