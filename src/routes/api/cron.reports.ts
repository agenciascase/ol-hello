import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runDueSchedules } from "../../lib/report-scheduler.server";

// Called every 15 minutes by the scheduler: GitHub Actions with SCASE_CRON_SECRET, or Lovable's own
// scheduler with LOVABLE_CRON_SECRET (Authorization: Bearer <secret>).
async function ownSecretMatches(request: Request) {
  const secret = process.env["SCASE_CRON_SECRET"] ?? "";
  const got = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (secret.length < 24 || got.length !== secret.length) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(got)), crypto.subtle.digest("SHA-256", enc.encode(secret))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

async function run(request: Request) {
  if (!(await ownSecretMatches(request))) {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
  }
  try {
    const summary = await runDueSchedules();
    return Response.json({ ranAt: new Date().toISOString(), processed: summary.length, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha no agendador" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/reports")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
