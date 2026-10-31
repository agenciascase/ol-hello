import { createFileRoute } from "@tanstack/react-router";
import { segredoConfere } from "../../lib/hub-tarefas.server";

// Fila do Gestor IA para a tarefa do Claude (Authorization: Bearer <AGENTE_TOKEN>).
//   GET  → pedidos que esperam o Claude (pendente, ativando) ou que ele está fazendo (executando, criando),
//          com o nome do cliente, o gestor e as contas de anúncio.
//   POST → { id, status, resultado?, desfazer?, link? } grava o andamento de um pedido.
// Fluxo: pendente → executando → feito | precisa_voce | erro;  campanha: criando → criada;  ativando → ativa.
const EM_ABERTO = ["pendente", "ativando", "executando", "criando"];
const PERMITIDOS = new Set([
  "executando",
  "feito",
  "precisa_voce",
  "erro",
  "criando",
  "criada",
  "ativa",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const semCache = { "Cache-Control": "no-store" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { from: (t: string) => any };
async function banco() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Banco;
}

async function listar() {
  const db = await banco();
  const { data, error } = await db
    .from("gestor_pedidos")
    .select(
      "id,client_id,tipo,chave,dados,status,resultado,desfazer,link,criado_em,atualizado_em,clients(name,gestor,client_ad_accounts(provider,account_id,account_name))",
    )
    .in("status", EM_ABERTO)
    .order("criado_em", { ascending: true })
    .limit(100);
  if (error)
    return Response.json({ error: "Não consegui ler a fila." }, { status: 500, headers: semCache });
  return Response.json({ pedidos: data ?? [] }, { headers: semCache });
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

async function gravar(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof corpo["id"] === "string" ? corpo["id"] : "";
  const status = typeof corpo["status"] === "string" ? corpo["status"] : "";
  if (!UUID.test(id))
    return Response.json({ error: "id inválido" }, { status: 400, headers: semCache });
  if (!PERMITIDOS.has(status))
    return Response.json(
      { error: "status inválido", permitidos: [...PERMITIDOS] },
      { status: 400, headers: semCache },
    );
  const link = texto(corpo["link"], 1000);
  if (link && !/^https:\/\//.test(link))
    return Response.json({ error: "link precisa começar com https://" }, { status: 400 });
  const mudanca: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() };
  for (const [campo, max] of [
    ["resultado", 6000],
    ["desfazer", 4000],
  ] as const) {
    const v = texto(corpo[campo], max);
    if (v !== undefined) mudanca[campo] = v;
  }
  if (link !== undefined) mudanca["link"] = link;
  const db = await banco();
  const { data, error } = await db
    .from("gestor_pedidos")
    .update(mudanca)
    .eq("id", id)
    .select("id,tipo,status,atualizado_em");
  if (error)
    return Response.json({ error: "Não consegui gravar." }, { status: 500, headers: semCache });
  if (!data?.length)
    return Response.json({ error: "Pedido não encontrado" }, { status: 404, headers: semCache });
  return Response.json({ ok: true, pedido: data[0] }, { headers: semCache });
}

export const Route = createFileRoute("/api/agente/pedidos")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await segredoConfere(request, "AGENTE_TOKEN"))
          ? listar()
          : Response.json({ error: "Não autorizado" }, { status: 401 }),
      POST: async ({ request }) =>
        (await segredoConfere(request, "AGENTE_TOKEN"))
          ? gravar(request)
          : Response.json({ error: "Não autorizado" }, { status: 401 }),
    },
  },
});
