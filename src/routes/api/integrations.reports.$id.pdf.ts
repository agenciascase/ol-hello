import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, UUID_RE } from "../../lib/agency-api.server";
import { buildReportFor, reportPanelUrl } from "../../lib/report-data.server";
import { renderReportPdf, reportPdfFilename } from "../../lib/report-pdf.server";

// Admin-only: preview the PDF exactly as the client will receive it.
export const Route = createFileRoute("/api/integrations/reports/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        if (!UUID_RE.test(params.id)) return Response.json({ error: "Relatório inválido." }, { status: 400, headers: noStore });
        try {
          const built = await buildReportFor({ id: params.id });
          if (!built) return Response.json({ error: "Relatório não encontrado." }, { status: 404, headers: noStore });
          const pdf = renderReportPdf(built.report, built.config.share_token ? reportPanelUrl(built.config.share_token) : null);
          return new Response(pdf as BodyInit, {
            headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportPdfFilename(built.report)}"` },
          });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Falha ao gerar o PDF.") }, { status: 502, headers: noStore });
        }
      },
    },
  },
});
