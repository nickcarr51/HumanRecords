// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { checkDatabase } = vi.hoisted(() => ({ checkDatabase: vi.fn() }));
vi.mock("@/lib/db/health", () => ({ checkDatabase }));

import { dynamic, GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  checkDatabase.mockReset();
});

describe("GET /api/health/db", () => {
  it("is never prerendered or cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers 200 with only { ok: true } when every check passes", async () => {
    checkDatabase.mockResolvedValue({ ok: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 503 with only { ok: false } and logs which check failed, with the error's name and code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    checkDatabase.mockResolvedValue({ ok: false, failed: "readsAuthUsers", error: "PostgresError 42501" });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(log.mock.calls).toEqual([["Database health check failed: readsAuthUsers (PostgresError 42501)"]]);
  });
});
