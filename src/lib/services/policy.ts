import type { Viewer } from "./viewer";
import { DomainError } from "./errors";

export type Action = "users.list";

declare const grantBrand: unique symbol;
// Only authorize() can make one, so asSystem() can't run without a policy check.
export type Grant = { readonly action: Action; readonly [grantBrand]: true };

const RULES: Record<Action, { allow: (v: Viewer) => boolean; message: string }> = {
  "users.list": { allow: (v) => v.role === "label_member", message: "Only label members can list users." },
};

const issued = new WeakSet<object>();

// True only for a Grant that authorize() returned.
export function isIssuedGrant(grant: Grant): boolean {
  return issued.has(grant);
}

export function authorize(viewer: Viewer, action: Action): Grant {
  const rule = RULES[action];
  if (!rule.allow(viewer)) throw new DomainError("FORBIDDEN", rule.message);
  const grant = { action } as Grant;
  issued.add(grant);
  return grant;
}
