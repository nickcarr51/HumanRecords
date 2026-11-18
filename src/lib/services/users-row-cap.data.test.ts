// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTestUser } from "@/lib/supabase/test-helpers";
import { listUsers } from "./users";
import { getViewer } from "./viewer";

// The real cap is 1000 rows. It is lowered to 1 here: the signed-in label
// member plus the second test user make at least two users.
vi.mock("@/lib/db/max-rows", () => ({ MAX_ROWS: 1 }));

describe("listUsers row cap", () => {
  it("returns at most the cap", async () => {
    const [label, other] = await Promise.all([createTestUser({ role: "label_member" }), createTestUser()]);
    try {
      const rows = await listUsers(await getViewer(await label.signIn()));
      expect(rows).toHaveLength(1);
    } finally {
      await Promise.all([label.cleanup(), other.cleanup()]);
    }
  });
});
