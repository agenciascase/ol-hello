/** Server-only: finds schedules that are due, claims them atomically and sends the reports. */
import { deliverReport } from "./report-delivery.server";
import { computeNextRun, type Frequency } from "./report-schedule";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

type DueRow = {
  id: string;
  frequency: Frequency;
  weekdays: number[];
  day_of_month: number | null;
  send_time: string;
  next_run_at: string;
  report_config_id: string;
  report_configs: { active: boolean; clients: { timezone: string; active: boolean } | null } | null;
};

export async function runDueSchedules(now = new Date(), limit = 20) {
  const db = await admin();
  const { data, error } = await db
    .from("report_schedules")
    .select("id,frequency,weekdays,day_of_month,send_time,next_run_at,report_config_id,report_configs!inner(active,clients!inner(timezone,active))")
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Falha ao buscar agendas: " + error.message);

  const summary: Array<{ schedule: string; status: "sent" | "partial" | "failed" | "skipped"; detail?: string }> = [];
  for (const row of (data ?? []) as unknown as DueRow[]) {
    const tz = row.report_configs?.clients?.timezone || "America/Sao_Paulo";
    const next = computeNextRun({ frequency: row.frequency, weekdays: row.weekdays, day_of_month: row.day_of_month, send_time: row.send_time.slice(0, 5) }, tz, now, now);
    // Claim: only the run that moves next_run_at forward sends the report (prevents duplicates).
    const { data: claimed } = await db
      .from("report_schedules")
      .update({ next_run_at: next?.toISOString() ?? null, last_run_at: now.toISOString(), updated_at: now.toISOString() } as never)
      .eq("id", row.id)
      .eq("next_run_at", row.next_run_at)
      .select("id");
    if (!claimed?.length) continue;

    if (!row.report_configs?.active || !row.report_configs.clients?.active) {
      summary.push({ schedule: row.id, status: "skipped", detail: "Relatório ou cliente inativo" });
      continue;
    }
    try {
      const { results } = await deliverReport(row.report_config_id, { trigger: "schedule", scheduleId: row.id });
      const failed = results.filter((r) => r.status === "failed").length;
      summary.push({ schedule: row.id, status: results.length === 0 ? "skipped" : failed === 0 ? "sent" : failed === results.length ? "failed" : "partial", ...(results.length === 0 ? { detail: "Sem destinatários" } : {}) });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Falha ao gerar o relatório";
      await db.from("report_deliveries").insert({ report_config_id: row.report_config_id, schedule_id: row.id, trigger: "schedule", channel: "email", recipient: "(relatório não gerado)", status: "failed", error: detail } as never);
      summary.push({ schedule: row.id, status: "failed", detail });
    }
  }
  return summary;
}
