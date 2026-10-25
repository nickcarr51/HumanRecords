// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { authorize } from "./policy";
import { getViewer } from "./viewer";

// The role rules, with Viewers from getViewer() for real signed-in users
// (authorize() refuses any Viewer getViewer() didn't make).
const admin = createAdminClient();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function viewerWith(role: "listener" | "artist" | "label_member") {
  const user = await createTestUser({ role });
  cleanups.push(user.cleanup);
  return getViewer(await user.signIn());
}

describe("authorize (real signed-in users)", () => {
  it("grants users.list to a label member", async () => {
    const viewer = await viewerWith("label_member");
    expect(authorize(viewer, "users.list").action).toBe("users.list");
  });

  it.each(["listener", "artist"] as const)("forbids users.list for %s", async (role) => {
    const viewer = await viewerWith(role);
    expect(viewer.role).toBe(role);
    expect(() => authorize(viewer, "users.list")).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN" }),
    );
  });

  it("forbids users.list for a user with no role (no public.users row)", async () => {
    const user = await createTestUser({ role: "label_member" });
    cleanups.push(user.cleanup);
    const client = await user.signIn();
    const { error } = await admin.from("users").delete().eq("id", user.id);
    if (error) throw error;
    const viewer = await getViewer(client);
    expect(viewer.role).toBeNull();
    expect(() => authorize(viewer, "users.list")).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN" }),
    );
  });

  it("refuses a copy of a real label member's Viewer", async () => {
    const viewer = await viewerWith("label_member");
    expect(() => authorize({ ...viewer }, "users.list")).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN" }),
    );
  });
});
