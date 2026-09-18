import "server-only";

// Server-only. Mints presigned R2 (S3-compatible) GET URLs. NEVER import
// from a client component — it reads the R2 secret via getR2Config().
import { AwsClient } from "aws4fetch";
import { getR2Config } from "./config";

export const STREAM_TTL_SECONDS = 7200; // 2h — must outlast the longest track for seeking
export const DOWNLOAD_TTL_SECONDS = 300; // 5min — one-shot grab
export const IMAGE_TTL_SECONDS = 3600; // 1h — comfortably outlasts a page session

async function signObjectUrl(
  key: string,
  opts: { expiresIn: number; downloadFilename?: string },
): Promise<string> {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = getR2Config();
  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: "auto",
    service: "s3",
  });
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(opts.expiresIn));
  if (opts.downloadFilename) {
    // RFC 6266: emit an ASCII fallback plus a UTF-8 form so non-ASCII titles
    // (e.g. "Café") aren't mangled by clients. The fallback strips
    // quotes/backslashes (so they can't break out of the quoted value) and
    // replaces any remaining non-ASCII byte; filename* carries the true name,
    // percent-encoded per RFC 5987.
    const asciiFallback = opts.downloadFilename
      .replace(/["\\]/g, "")
      .replace(/[^\x20-\x7e]/g, "_");
    const utf8 = encodeURIComponent(opts.downloadFilename);
    url.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`,
    );
  }
  const signed = await aws.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

export function signStreamUrl(key: string): Promise<string> {
  return signObjectUrl(key, { expiresIn: STREAM_TTL_SECONDS });
}

export function signDownloadUrl(key: string, filename: string): Promise<string> {
  return signObjectUrl(key, {
    expiresIn: DOWNLOAD_TTL_SECONDS,
    downloadFilename: filename,
  });
}

export async function signImageUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  return signObjectUrl(key, { expiresIn: IMAGE_TTL_SECONDS });
}
