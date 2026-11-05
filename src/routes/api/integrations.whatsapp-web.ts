import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin } from "../../lib/agency-api.server";

// WhatsApp pelo QR Code (só administrador):
//   GET  → situação: desconectado | conectando | aguardando_qr (com a imagem do QR) | conectado (com o número)
//   POST { acao: "conectar" }    → começa a conexão (mostra o QR Code se não houver sessão salva)
//   POST { acao: "desconectar" } → sai do WhatsApp e apaga a sessão do servidor
export const Route = createFileRoute("/api/integrations/whatsapp-web")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const negado = await requireAgencyAdmin(request);
        if (negado) return negado;
        const wa = await import("../../lib/whatsapp-web.server");
        // se o servidor reiniciou e existe sessão salva, reconecta sozinho
        if (wa.situacao().estado === "desconectado" && (await wa.temSessao()))
          void wa.conectar().catch(() => undefined);
        return Response.json(wa.situacao(), { headers: noStore });
      },
      POST: async ({ request }) => {
        const negado = await requireAgencyAdmin(request, { mutating: true });
        if (negado) return negado;
        const corpo = (await request.json().catch(() => ({}))) as { acao?: unknown };
        const wa = await import("../../lib/whatsapp-web.server");
        try {
          if (corpo.acao === "desconectar") {
            await wa.desconectar();
            return Response.json(wa.situacao(), { headers: noStore });
          }
          if (corpo.acao === "conectar") {
            await wa.conectar();
            return Response.json(wa.situacao(), { headers: noStore });
          }
          return Response.json({ error: "Ação inválida." }, { status: 400, headers: noStore });
        } catch (e) {
          return Response.json(
            { error: errorMessage(e, "Não foi possível conectar o WhatsApp.") },
            { status: 502, headers: noStore },
          );
        }
      },
    },
  },
});
