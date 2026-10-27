import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { buildReport } from "../../lib/report-data.server";
import { ALL_SECTIONS, OBJECTIVES, isObjective, metricsFor } from "../../lib/report-insights";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Agency "Visão geral": the same complete report the client receives, for any account and
 * any period picked in the dashboard filter. Uses the client's goals and objective when the
 * account is linked to a client.
 */
export const Route = createFileRoute("/api/integrations/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        const u = new URL(request.url);
        const platform = u.searchParams.get("platform");
        const raw = u.searchParams.get("account_id") ?? "";
        const from = u.searchParams.get("from") ?? "";
        const to = u.searchParams.get("to") ?? "";
        const campaign = (u.searchParams.get("campaign") ?? "").trim().slice(0, 200) || null;
        const compare = u.searchParams.get("compare") === "1";
        // The dashboard lists Meta accounts without the "act_" prefix; the Graph API needs it.
        const accountId = platform === "google" ? raw.replace(/-/g, "") : /^\d+$/.test(raw) ? "act_" + raw : raw;
        const validAccount = platform === "meta" ? /^act_\d+$/.test(accountId) : platform === "google" ? /^\d{6,12}$/.test(accountId) : false;
        if (!validAccount || !DATE.test(from) || !DATE.test(to) || from > to) return Response.json({ error: "Conta ou período inválido." }, { status: 400, headers: noStore });

        try {
          const db = await supabaseAdmin();
          const { data: link } = await db.from("client_ad_accounts").select("client_id,account_name").eq("provider", platform).eq("account_id", accountId).limit(1).maybeSingle();
          const clientId = (link as { client_id?: string } | null)?.client_id ?? null;
          const [{ data: client }, { data: cfg }, { data: cat }] = await Promise.all([
            clientId
              ? db.from("clients").select("name,timezone,logo_url,monthly_budget,goal_cpa,goal_conversions_month,goal_roas,meta_tax_pct,google_tax_pct").eq("id", clientId).maybeSingle()
              : Promise.resolve({ data: null }),
            clientId ? db.from("report_configs").select("objective").eq("client_id", clientId).eq("active", true).limit(1).maybeSingle() : Promise.resolve({ data: null }),
            db.from("ad_accounts_catalog").select("name").eq("provider", platform).eq("account_id", accountId).maybeSingle(),
          ]);
          const c = client as Record<string, unknown> | null;
          const accountName = (link as { account_name?: string } | null)?.account_name ?? (cat as { name?: string } | null)?.name ?? accountId;
          const objRaw = String((cfg as { objective?: string } | null)?.objective ?? "");
          const objective = isObjective(objRaw) ? objRaw : "leads";
          const num = (k: string) => (c && c[k] !== null && c[k] !== undefined ? Number(c[k]) : null);

          const report = await buildReport({
            client: {
              name: c ? String(c["name"]) : accountName,
              timezone: c ? String(c["timezone"] ?? "America/Sao_Paulo") : "America/Sao_Paulo",
              logo_url: c ? ((c["logo_url"] as string | null) ?? null) : null,
              monthly_budget: num("monthly_budget"),
              goal_cpa: num("goal_cpa"),
              goal_conversions_month: num("goal_conversions_month"),
              goal_roas: num("goal_roas"),
              meta_tax_pct: num("meta_tax_pct"),
              google_tax_pct: num("google_tax_pct"),
            },
            config: {
              name: `${platform === "meta" ? "Meta Ads" : "Google Ads"} · ${accountName}`,
              platforms: [platform as string],
              metrics: metricsFor(objective, "complete"),
              period: "custom",
              range: { since: from, until: to },
              compare_previous: compare,
              campaign_filter: campaign,
              intro_message: null,
              objective,
              sections: ALL_SECTIONS.filter((s) => s !== "analysis"),
              manager_notes: null,
              actions_taken: null,
              next_steps: null,
            },
            accounts: [{ provider: platform as string, account_id: accountId, account_name: accountName }],
          });
          const { errors, ...rest } = report;
          return Response.json(
            { ...rest, partial: errors.length > 0, errors, linkedClient: c ? String(c["name"]) : null, objectiveLabel: OBJECTIVES[objective].label },
            { headers: noStore },
          );
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível consultar os resultados desta conta.") }, { status: 503, headers: noStore });
        }
      },
    },
  },
});
