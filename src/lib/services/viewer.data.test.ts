// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createTestUser } from "@/lib/supabase/test-helpers";
import { DomainError } from "./errors";
import { getClaims, getViewer } from "./viewer";

const admin = createAdminClient();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

describe("getViewer", () => {
  it("reads the role from the database, not the JWT", async () => {
    const user = await createTestUser({ role: "listener" });
    cleanups.push(user.cleanup);
    const client = await user.signIn(); // JWT app_metadata still says listener
    await admin.from("users").update({ role: "label_member" }).eq("id", user.id);
    expect((await getViewer(client)).role).toBe("label_member");
  });

  it("rejects a signed-out client with UNAUTHENTICATED", async () => {
    await expect(getClaims(createAnonClient())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(getClaims(createAnonClient())).rejects.toBeInstanceOf(DomainError);
  });
});
