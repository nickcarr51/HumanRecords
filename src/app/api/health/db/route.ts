import { checkDatabase } from "@/lib/db/health";

// Never prerendered or cached: every request checks the database again.
export const dynamic = "force-dynamic";

// Signed-out safe: the answer is only { ok }, with no data, version or
// details. Which check failed goes to the server log only.
export async function GET() {
  const health = await checkDatabase();
  if (health.ok) return Response.json({ ok: true });
  console.error(`Database health check failed: ${health.failed}`);
  return Response.json({ ok: false }, { status: 503 });
}
