import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin, UUID_RE } from "../../lib/agency-api.server";
import { listActiveAds } from "../../lib/active-ads.server";

// Admin-only: ads currently running on the client's Meta accounts, with creatives and 30-day results.
export const Route = createFileRoute("/api/integrations/clients/$id/active-ads")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Cliente inválido." }, { status: 400, headers: noStore });
        try {
          const db = await supabaseAdmin();
          const [{ data: client }, { data: accounts }] = await Promise.all([
            db.from("clients").select("name,logo_url").eq("id", params.id).maybeSingle(),
            db.from("client_ad_accounts").select("provider,account_id,account_name").eq("client_id", params.id),
          ]);
          if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404, headers: noStore });
          const r = await listActiveAds(accounts ?? []);
          return Response.json({ client, ...r, generatedAt: new Date().toISOString() }, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível listar os anúncios.") }, { status: 503, headers: noStore });
        }
      },
    },
  },
});
