import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin, UUID_RE } from "../../lib/agency-api.server";
import { buildReport } from "../../lib/report-data.server";
import { writeAnalysis } from "../../lib/report-analysis.server";
import { isObjective } from "../../lib/report-insights";
import { PERIOD_RE } from "../../lib/report-schedule";

type Body = { platforms?: string[]; period?: string; compare_previous?: boolean; campaign_mode?: string; campaign_ids?: string[]; objective?: string; metrics?: string[] };

// Admin-only: period analysis for the report being edited (saved or not), from its current settings.
export const Route = createFileRoute("/api/integrations/clients/$id/analysis")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request, { mutating: true });
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Cliente inválido." }, { status: 400, headers: noStore });
        const b = (await request.json().catch(() => ({}))) as Body;
        const period = typeof b.period === "string" && PERIOD_RE.test(b.period) ? b.period : "last_7_days";
        const platforms = (b.platforms ?? []).filter((p) => p === "meta" || p === "google");
        if (!platforms.length) return Response.json({ error: "Escolha a plataforma do relatório." }, { status: 400, headers: noStore });
        try {
          const db = await supabaseAdmin();
          const [{ data: client }, { data: accounts }] = await Promise.all([
            db.from("clients").select("name,timezone,logo_url,monthly_budget,goal_cpa,goal_conversions_month,goal_roas,meta_tax_pct,google_tax_pct").eq("id", params.id).maybeSingle(),
            db.from("client_ad_accounts").select("provider,account_id,account_name").eq("client_id", params.id),
          ]);
          if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404, headers: noStore });
          const report = await buildReport({
            client: client as never,
            accounts: accounts ?? [],
            config: {
              name: "Análise",
              platforms,
              metrics: b.metrics?.length ? b.metrics : ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "cpa"],
              period,
              compare_previous: b.compare_previous !== false,
              campaign_filter: null,
              campaign_mode: b.campaign_mode ?? "all",
              campaign_ids: Array.isArray(b.campaign_ids) ? b.campaign_ids.slice(0, 500).map(String) : [],
              intro_message: null,
              objective: isObjective(b.objective ?? "") ? b.objective! : "leads",
              sections: ["highlights", "goals", "campaigns", "history"],
              manager_notes: null,
              actions_taken: null,
              next_steps: null,
            },
          });
          if (report.total.current.spend === 0 && report.total.current.impressions === 0)
            return Response.json({ error: report.errors[0] ?? "Não houve veiculação no período escolhido, então não há o que analisar." }, { status: 422, headers: noStore });
          const out = await writeAnalysis(report);
          return Response.json(out, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível gerar a análise.") }, { status: 502, headers: noStore });
        }
      },
    },
  },
});
