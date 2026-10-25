import { afterEach, describe, expect, it, vi } from "vitest";
import { getClaims } from "./viewer";

type Client = Parameters<typeof getClaims>[0];

// A stand-in client whose getClaims() reports an auth error.
function clientWithAuthError(error: Error) {
  return { auth: { getClaims: async () => ({ data: null, error }) } } as unknown as Client;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getClaims when the auth library reports an error", () => {
  it("logs one line with only the error's name and status, then throws UNAUTHENTICATED", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("secret-token-abc could not be checked"), {
      name: "AuthRetryableFetchError",
      status: 502,
    });
    await expect(getClaims(clientWithAuthError(error))).rejects.toMatchObject({
      name: "DomainError",
      code: "UNAUTHENTICATED",
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toEqual(["Session check failed: AuthRetryableFetchError (status 502)"]);
  });

  it("says so when the error has no status", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("bad signature"), { name: "AuthInvalidJwtError" });
    await expect(getClaims(clientWithAuthError(error))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(log.mock.calls).toEqual([["Session check failed: AuthInvalidJwtError (status none)"]]);
  });
});
