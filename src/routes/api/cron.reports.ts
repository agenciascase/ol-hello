import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runDueSchedules } from "../../lib/report-scheduler.server";

// Called every 15 minutes by the scheduler (Authorization: Bearer LOVABLE_CRON_SECRET).
async function run(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
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
