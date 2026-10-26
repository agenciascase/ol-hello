import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, UUID_RE } from "../../lib/agency-api.server";
import { deliverReport } from "../../lib/report-delivery.server";

// Admin-only: send a report right now to every recipient of its client.
export const Route = createFileRoute("/api/integrations/reports/$id/send")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request, { mutating: true });
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Relatório inválido." }, { status: 400, headers: noStore });
        try {
          const out = await deliverReport(params.id, { trigger: "manual" });
          return Response.json(out, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Falha ao enviar o relatório.") }, { status: 502, headers: noStore });
        }
      },
    },
  },
});
