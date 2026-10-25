import { isIssuedViewer, type Viewer } from "./viewer";
import { DomainError } from "./errors";

export type Action = "users.list";

// A type-only marker: no value carries it, so code outside authorize() can't
// write a Grant without a cast (yarn typecheck catches that).
declare const grantOnly: unique symbol;
// Only authorize() can make one, so asSystem() can't run without a policy check.
export type Grant = { readonly action: Action; readonly [grantOnly]: true };

const RULES: Record<Action, { allow: (v: Viewer) => boolean; message: string }> = {
  "users.list": { allow: (v) => v.role === "label_member", message: "Only label members can list users." },
};

const issued = new WeakSet<object>();

// True only for a Grant that authorize() returned.
export function isIssuedGrant(grant: Grant): boolean {
  return issued.has(grant);
}

// Checked at runtime too: a Viewer must come from getViewer() and a Grant from
// authorize(), so a hand-built object can't pass either check.
export function authorize(viewer: Viewer, action: Action): Grant {
  if (!isIssuedViewer(viewer)) throw new DomainError("FORBIDDEN", "Not authorized.");
  const rule = RULES[action];
  if (!rule.allow(viewer)) throw new DomainError("FORBIDDEN", rule.message);
  const grant = { action } as Grant;
  issued.add(grant);
  return grant;
}
