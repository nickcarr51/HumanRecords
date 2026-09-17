import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.R2_ACCOUNT_ID = "testacct";
  process.env.R2_ACCESS_KEY_ID = "AKIATEST";
  process.env.R2_SECRET_ACCESS_KEY = "testsecret";
  process.env.R2_BUCKET_NAME = "test-bucket";
  process.env.R2_ENDPOINT = "https://testacct.r2.cloudflarestorage.com";
});

import { signDownloadUrl, signImageUrl, signStreamUrl } from "./sign";

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
