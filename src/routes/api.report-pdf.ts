import { createFileRoute } from "@tanstack/react-router";
import { buildReportFor, REPORT_TOKEN_RE, reportPanelUrl } from "../lib/report-data.server";
import { renderReportPdf, reportPdfFilename } from "../lib/report-pdf.server";

// Public: PDF version of a client's report (used as the WhatsApp document link).
export const Route = createFileRoute("/api/report-pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!REPORT_TOKEN_RE.test(token)) return Response.json({ error: "Link inválido." }, { status: 400 });
        try {
          const built = await buildReportFor({ token });
          if (!built || !built.config.active || !built.client.active) return Response.json({ error: "Link expirado ou revogado." }, { status: 404 });
          const pdf = renderReportPdf({ ...built.report, errors: [] }, reportPanelUrl(token));
          return new Response(pdf as BodyInit, {
            headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${reportPdfFilename(built.report)}"`, "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer" },
          });
        } catch {
          return Response.json({ error: "Não foi possível gerar o PDF agora." }, { status: 503 });
        }
      },
    },
  },
});
