import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, UUID_RE } from "../../lib/agency-api.server";
import { buildReportFor } from "../../lib/report-data.server";
import { draftAnalysis } from "../../lib/report-insights";

// Admin-only: suggested manager analysis built from the report's current numbers (cached up to 30 min).
export const Route = createFileRoute("/api/integrations/reports/$id/draft")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Relatório inválido." }, { status: 400, headers: noStore });
        try {
          const built = await buildReportFor({ id: params.id });
          if (!built) return Response.json({ error: "Relatório não encontrado." }, { status: 404, headers: noStore });
          const r = built.report;
          return Response.json({ draft: draftAnalysis(r.highlights, r.goals, r.pacing), highlights: r.highlights, warnings: r.errors }, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível gerar a sugestão.") }, { status: 502, headers: noStore });
        }
      },
    },
  },
});
