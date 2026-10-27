import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { listCampaigns } from "../../lib/report-data.server";

// Admin-only: campaigns of a client's linked accounts, to choose which ones a report shows.
export const Route = createFileRoute("/api/integrations/clients/$id/campaigns")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        if (!/^[0-9a-f-]{36}$/.test(params.id)) return Response.json({ error: "Cliente inválido." }, { status: 400, headers: noStore });
        try {
          const db = await supabaseAdmin();
          const { data } = await db.from("client_ad_accounts").select("provider,account_id,account_name").eq("client_id", params.id);
          return Response.json(await listCampaigns(data ?? []), { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível listar as campanhas.") }, { status: 503, headers: noStore });
        }
      },
    },
  },
});
