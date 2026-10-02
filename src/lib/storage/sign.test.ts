import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.R2_ACCOUNT_ID = "testacct";
  process.env.R2_ACCESS_KEY_ID = "AKIATEST";
  process.env.R2_SECRET_ACCESS_KEY = "testsecret";
  process.env.R2_BUCKET_NAME = "test-bucket";
  process.env.R2_ENDPOINT = "https://testacct.r2.cloudflarestorage.com";
});

import { headObject, signDownloadUrl, signImageUrl, signStreamUrl, signUploadUrl } from "./sign";

describe("signStreamUrl", () => {
  it("signs a 2h GET URL for the object key", async () => {
    const url = await signStreamUrl("tracks/abc/audio.mp3");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://testacct.r2.cloudflarestorage.com/test-bucket/tracks/abc/audio.mp3",
    );
    expect(u.searchParams.get("X-Amz-Expires")).toBe("7200");
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(u.searchParams.get("X-Amz-Credential")).toContain("AKIATEST");
    expect(u.searchParams.get("response-content-disposition")).toBeNull();
  });
});

describe("signDownloadUrl", () => {
  it("signs a 5min GET URL that forces download with a filename", async () => {
    const url = await signDownloadUrl("tracks/abc/audio.mp3", "Song Title.mp3");
    const u = new URL(url);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
    const disp = u.searchParams.get("response-content-disposition");
    expect(disp).toContain("attachment");
    expect(disp).toContain('filename="Song Title.mp3"');
  });

  it("uses an RFC 6266 filename* form for non-ASCII filenames", async () => {
    const url = await signDownloadUrl("tracks/abc/audio.mp3", "Café.mp3");
    const u = new URL(url);
    const disp = u.searchParams.get("response-content-disposition");
    // UTF-8 form carries the real name, percent-encoded per RFC 5987
    expect(disp).toContain("filename*=UTF-8''");
    expect(disp).toContain(encodeURIComponent("Café.mp3")); // Caf%C3%A9.mp3
    // ASCII fallback keeps the non-ASCII char replaced, not dropped
    expect(disp).toContain('filename="Caf_.mp3"');
  });
});

describe("signImageUrl", () => {
  it("returns null for a null key", async () => {
    expect(await signImageUrl(null)).toBeNull();
  });

  it("signs a 1h GET URL for an image key", async () => {
    const url = await signImageUrl("track-art/abc/cover.jpg");
    const u = new URL(url!);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("signUploadUrl", () => {
  it("signs a 15min PUT URL with content-type as a signed header", async () => {
    const url = await signUploadUrl("tracks/abc.mp3", "audio/mpeg");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://testacct.r2.cloudflarestorage.com/test-bucket/tracks/abc.mp3",
    );
    expect(u.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("headObject", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the size when the object exists", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { "content-length": "1234" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await headObject("tracks/abc.mp3")).toEqual({ size: 1234 });
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.method).toBe("HEAD");
    expect(req.url).toBe("https://testacct.r2.cloudflarestorage.com/test-bucket/tracks/abc.mp3");
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await headObject("tracks/missing.mp3")).toBeNull();
  });

  it("throws on other errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(headObject("tracks/x.mp3")).rejects.toThrow("403");
  });
});
