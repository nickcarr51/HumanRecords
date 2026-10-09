import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { claimInvite, findUnusedInvite, restoreInvite, upsertInvite } from "./store";

// test-helpers' admin client is untyped; the store wants the typed client.
const db = createAdminClient() as unknown as Parameters<typeof upsertInvite>[0];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function invitedUser() {
  const u = await createTestUser();
  cleanups.push(u.cleanup);
  const token = `t-${randomUUID()}`;
  await upsertInvite(db, { userId: u.id, token, createdBy: u.id });
  return { id: u.id, token };
}

describe("invite store", () => {
  it("finds an unused invite by token and misses unknown tokens", async () => {
    const { id, token } = await invitedUser();
    expect(await findUnusedInvite(db, token)).toEqual({ userId: id });
    expect(await findUnusedInvite(db, "nope")).toBeNull();
    expect(await findUnusedInvite(db, "")).toBeNull();
  });

  it("claims once: token cleared, used_at set, second claim misses", async () => {
    const { id, token } = await invitedUser();
    const claim = await claimInvite(db, token);
    expect(claim?.userId).toBe(id);
    expect(await claimInvite(db, token)).toBeNull();
    expect(await findUnusedInvite(db, token)).toBeNull();
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const { token } = await invitedUser();
    const results = await Promise.all([claimInvite(db, token), claimInvite(db, token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("restores a claimed token so it works again", async () => {
    const { id, token } = await invitedUser();
    const claim = (await claimInvite(db, token))!;
    await restoreInvite(db, claim, token);
    expect(await findUnusedInvite(db, token)).toEqual({ userId: id });
  });

  it("does not restore over a regenerated token", async () => {
    const { id, token } = await invitedUser();
    const claim = (await claimInvite(db, token))!;
    await upsertInvite(db, { userId: id, token: "fresh-token", createdBy: id });
    await restoreInvite(db, claim, token);
    expect(await findUnusedInvite(db, token)).toBeNull();
    expect(await findUnusedInvite(db, "fresh-token")).toEqual({ userId: id });
  });

  it("upsert on a used invite issues a fresh unused token", async () => {
    const { id, token } = await invitedUser();
    await claimInvite(db, token);
    await upsertInvite(db, { userId: id, token: "again", createdBy: id });
    expect(await findUnusedInvite(db, "again")).toEqual({ userId: id });
  });
});
