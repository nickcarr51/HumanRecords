// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { changeUserRole } from "./users";
import { getViewer } from "./viewer";

// changeUserRole, checked the way it was checked next to the
// admin_set_user_role SQL function it replaced (dropped in slice 4).
const admin = createAdminClient();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function user(role: "listener" | "artist" | "label_member") {
  const u = await createTestUser({ role });
  cleanups.push(u.cleanup);
  return u;
}

async function roleOf(id: string) {
  const { data, error } = await admin.from("users").select("role").eq("id", id).single();
  if (error) throw error;
  return data.role as string;
}

describe("changeUserRole (was admin_set_user_role)", () => {
  it("changes another user's role", async () => {
    const caller = await user("label_member");
    const client = await caller.signIn();
    const next = await user("listener");
    await changeUserRole(await getViewer(client), next.id, "artist");
    expect(await roleOf(next.id)).toBe("artist");
    expect(await roleOf(caller.id)).toBe("label_member");
  });

  it("refuses your own role and leaves it", async () => {
    const label = await user("label_member");
    const client = await label.signIn();
    await expect(changeUserRole(await getViewer(client), label.id, "listener")).rejects.toMatchObject({
      name: "DomainError",
      code: "INVALID",
    });
    expect(await roleOf(label.id)).toBe("label_member");
  });

  it("refuses your own id written in uppercase and leaves the role", async () => {
    const label = await user("label_member");
    const client = await label.signIn();
    const upper = label.id.toUpperCase();
    await expect(changeUserRole(await getViewer(client), upper, "listener")).rejects.toMatchObject({
      name: "DomainError",
      code: "INVALID",
    });
    expect(await roleOf(label.id)).toBe("label_member");
  });

  it("reports an unknown user", async () => {
    const client = await (await user("label_member")).signIn();
    const missing = "00000000-0000-0000-0000-000000000000";
    await expect(changeUserRole(await getViewer(client), missing, "artist")).rejects.toMatchObject({
      name: "DomainError",
      code: "NOT_FOUND",
    });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and leaves the target", async (role) => {
    const client = await (await user(role)).signIn();
    const target = await user("listener");
    await expect(changeUserRole(await getViewer(client), target.id, "label_member")).rejects.toMatchObject({
      name: "DomainError",
      code: "FORBIDDEN",
    });
    expect(await roleOf(target.id)).toBe("listener");
  });
});
