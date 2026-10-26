import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin, supabaseAdmin, UUID_RE } from "../../lib/agency-api.server";
import { newReportToken, reportPanelUrl } from "../../lib/report-data.server";

// Admin-only: create, rotate or revoke the public panel link of a report configuration.
export const Route = createFileRoute("/api/integrations/reports/$id/share")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request, { mutating: true });
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Relatório inválido." }, { status: 400, headers: noStore });
        const body = (await request.json().catch(() => ({}))) as { action?: string };
        const action = body.action ?? "create";
        if (!["create", "rotate", "revoke"].includes(action)) return Response.json({ error: "Ação inválida." }, { status: 400, headers: noStore });
        const db = await supabaseAdmin();
        const { data: current } = await db.from("report_configs").select("share_token").eq("id", params.id).maybeSingle();
        if (!current) return Response.json({ error: "Relatório não encontrado." }, { status: 404, headers: noStore });
        if (action === "create" && current.share_token) return Response.json({ token: current.share_token, url: reportPanelUrl(current.share_token) }, { headers: noStore });
        const token = action === "revoke" ? null : await newReportToken();
        const { error } = await db.from("report_configs").update({ share_token: token, updated_at: new Date().toISOString() }).eq("id", params.id);
        if (error) return Response.json({ error: "Não foi possível atualizar o link." }, { status: 500, headers: noStore });
        return Response.json({ token, url: token ? reportPanelUrl(token) : null }, { headers: noStore });
      },
    },
  },
});
