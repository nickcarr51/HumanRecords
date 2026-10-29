// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { changeUserRole } from "./users";
import { getViewer } from "./viewer";

// changeUserRole next to the admin_set_user_role SQL function it replaces: on
// the same kind of user, both give the same result.
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

describe("changeUserRole vs admin_set_user_role", () => {
  it("changes another user's role", async () => {
    const caller = await user("label_member");
    const client = await caller.signIn();
    const [old, next] = [await user("listener"), await user("listener")];
    expect((await client.rpc("admin_set_user_role", { target: old.id, new_role: "artist" })).error).toBeNull();
    await changeUserRole(await getViewer(client), next.id, "artist");
    expect([await roleOf(old.id), await roleOf(next.id)]).toEqual(["artist", "artist"]);
    expect(await roleOf(caller.id)).toBe("label_member");
  });

  it("refuses your own role and leaves it", async () => {
    const label = await user("label_member");
    const client = await label.signIn();
    const { error } = await client.rpc("admin_set_user_role", { target: label.id, new_role: "listener" });
    expect(error?.code).toBe("22023");
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
    const { error } = await client.rpc("admin_set_user_role", { target: upper, new_role: "listener" });
    expect(error?.code).toBe("22023");
    await expect(changeUserRole(await getViewer(client), upper, "listener")).rejects.toMatchObject({
      name: "DomainError",
      code: "INVALID",
    });
    expect(await roleOf(label.id)).toBe("label_member");
  });

  it("reports an unknown user", async () => {
    const client = await (await user("label_member")).signIn();
    const missing = "00000000-0000-0000-0000-000000000000";
    const { error } = await client.rpc("admin_set_user_role", { target: missing, new_role: "artist" });
    expect(error?.code).toBe("P0002");
    await expect(changeUserRole(await getViewer(client), missing, "artist")).rejects.toMatchObject({
      name: "DomainError",
      code: "NOT_FOUND",
    });
  });

  it.each(["listener", "artist"] as const)("refuses the %s role and leaves the target", async (role) => {
    const client = await (await user(role)).signIn();
    const target = await user("listener");
    const { error } = await client.rpc("admin_set_user_role", { target: target.id, new_role: "label_member" });
    expect(error?.code).toBe("42501");
    await expect(changeUserRole(await getViewer(client), target.id, "label_member")).rejects.toMatchObject({
      name: "DomainError",
      code: "FORBIDDEN",
    });
    expect(await roleOf(target.id)).toBe("listener");
  });
});
