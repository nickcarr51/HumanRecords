// @vitest-environment node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = fileURLToPath(new URL("./guard-db.sh", import.meta.url));
const decide = (command: string) =>
  execFileSync("bash", [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });

describe("guard-db.sh", () => {
  it.each([
    "yarn supabase db push",
    "yarn supabase migration list --linked",
    "aws s3 rm s3://humanrecords-media-dev/x.mp3 --endpoint-url https://x.r2.cloudflarestorage.com",
    "aws s3 rb s3://anything",
    "aws s3api delete-object --bucket b --key k",
    "rclone purge r2:humanrecords-media-dev",
    "wrangler r2 object delete humanrecords-media-dev/x.mp3",
    "echo humanrecords-media-prod",
    "cat x | grep HUMANRECORDS-BACKUPS",
    "yarn supabase link --project-ref gglrarflzvfxhdnjbnvt",
    "curl https://gglrarflzvfxhdnjbnvt.supabase.co/rest/v1/",
  ])("asks for: %s", (cmd) => {
    expect(decide(cmd)).toContain('"permissionDecision": "ask"');
  });

  it.each(["ls -la", "yarn supabase migration up", "yarn supabase db reset", "yarn test", "aws s3 ls s3://humanrecords-media-local"])(
    "allows: %s",
    (cmd) => {
      expect(decide(cmd)).toBe("");
    },
  );
});
