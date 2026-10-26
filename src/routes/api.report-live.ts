import { createFileRoute } from "@tanstack/react-router";
import { buildReportFor, REPORT_TOKEN_RE } from "../lib/report-data.server";

// Public: data for a client's report panel, identified only by its revocable share token.
export const Route = createFileRoute("/api/report-live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const headers = { "Cache-Control": "private, max-age=60", "Referrer-Policy": "no-referrer" };
        if (!REPORT_TOKEN_RE.test(token)) return Response.json({ error: "Link inválido." }, { status: 400, headers });
        try {
          const built = await buildReportFor({ token });
          if (!built || !built.config.active || !built.client.active) return Response.json({ error: "Link expirado ou revogado." }, { status: 404, headers });
          // Account-level error details stay internal; the client only sees that some data is missing.
          const { errors, ...report } = built.report;
          return Response.json({ ...report, partial: errors.length > 0 }, { headers });
        } catch {
          return Response.json({ error: "Não foi possível atualizar os dados. Tente novamente em instantes." }, { status: 503, headers });
        }
      },
    },
  },
});
