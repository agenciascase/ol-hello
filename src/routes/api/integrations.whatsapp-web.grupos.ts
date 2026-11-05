import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin } from "../../lib/agency-api.server";

// Grupos do WhatsApp conectado pelo QR Code (só administrador), para escolher no relatório.
// Responde { conectado: false } quando o WhatsApp pelo QR Code não está ligado.
export const Route = createFileRoute("/api/integrations/whatsapp-web/grupos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const negado = await requireAgencyAdmin(request);
        if (negado) return negado;
        const wa = await import("../../lib/whatsapp-web.server");
        if (!(await wa.temSessao()))
          return Response.json({ conectado: false, grupos: [] }, { headers: noStore });
        try {
          const atualizar = new URL(request.url).searchParams.get("atualizar") === "1";
          return Response.json(
            { conectado: true, grupos: await wa.listarGrupos(atualizar) },
            { headers: noStore },
          );
        } catch (e) {
          return Response.json(
            {
              conectado: false,
              grupos: [],
              error: e instanceof Error ? e.message : "Não consegui listar os grupos.",
            },
            { headers: noStore },
          );
        }
      },
    },
  },
});
