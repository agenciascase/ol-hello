import { createFileRoute } from "@tanstack/react-router";
import { requireAgencyAdmin, noStore } from "../../lib/agency-api.server";
import { avisarPedidoNovo } from "../../lib/hub-tarefas.server";

// A página do Gestor IA chama depois de registrar um pedido (Otimizar, Subir campanha, Ativar,
// Pedir alteração). O servidor chama a tarefa do Claude, que executa a fila.
export const Route = createFileRoute("/api/gestor/avisar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await requireAgencyAdmin(request, { mutating: true });
        if (negado) return negado;
        try {
          return Response.json(await avisarPedidoNovo(), { headers: noStore });
        } catch {
          return Response.json(
            { error: "Não consegui avisar o Claude agora." },
            { status: 500, headers: noStore },
          );
        }
      },
    },
  },
});
