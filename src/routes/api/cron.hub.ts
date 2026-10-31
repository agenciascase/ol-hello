import { createFileRoute } from "@tanstack/react-router";
import {
  copiaDeSeguranca,
  iniciarGestor,
  iniciarRelatorios,
  reacionarSeParado,
  segredoConfere,
  ultimaRodada,
} from "../../lib/hub-tarefas.server";

// Chamado pelo Cron da Hostinger (Authorization: Bearer <SCASE_CRON_SECRET>):
//   ?tarefa=gestor      a cada 15 min (o próprio servidor só roda das 6h às 22h de Brasília)
//   ?tarefa=relatorios  a cada 15 min (relatórios agendados + pedidos parados)
//   ?tarefa=backup      uma vez por dia
//   ?tarefa=estado      mostra o resultado das últimas rodadas (só números)
// gestor e relatorios rodam em segundo plano: a resposta volta na hora.
async function rodar(request: Request) {
  if (!(await segredoConfere(request, "SCASE_CRON_SECRET")))
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(request.url);
  const tarefa = url.searchParams.get("tarefa") ?? "";
  const semCache = { "Cache-Control": "no-store" };
  try {
    if (tarefa === "gestor")
      return Response.json(iniciarGestor({ forcar: url.searchParams.get("forcar") === "1" }), {
        status: 202,
        headers: semCache,
      });
    if (tarefa === "relatorios") {
      const relatorios = iniciarRelatorios();
      const pedidos = await reacionarSeParado().catch((e) => ({
        erro: e instanceof Error ? e.message : "falha",
      }));
      return Response.json({ relatorios, pedidos }, { status: 202, headers: semCache });
    }
    if (tarefa === "backup") return Response.json(await copiaDeSeguranca(), { headers: semCache });
    if (tarefa === "estado") return Response.json(ultimaRodada(), { headers: semCache });
    return Response.json(
      { error: "Tarefa desconhecida (use gestor, relatorios, backup ou estado)" },
      { status: 400 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha na tarefa" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/cron/hub")({
  server: {
    handlers: { POST: ({ request }) => rodar(request), GET: ({ request }) => rodar(request) },
  },
});
