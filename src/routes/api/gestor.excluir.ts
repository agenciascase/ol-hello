import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin, UUID_RE } from "../../lib/agency-api.server";

// "Excluir do HUB" (cliente que a agência não atende mais). POST { client_id }.
// Não apaga o histórico: o cliente fica INATIVO (some do Gestor IA, da lista de clientes e não recebe
// relatório). Para trazer de volta: Clientes → Inativos → editar → "Cliente ativo".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { from: (t: string) => any };

export const Route = createFileRoute("/api/gestor/excluir")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await requireAgencyAdmin(request, { mutating: true });
        if (negado) return negado;
        const corpo = (await request.json().catch(() => ({}))) as { client_id?: unknown };
        const id = typeof corpo.client_id === "string" ? corpo.client_id : "";
        if (!UUID_RE.test(id))
          return Response.json({ error: "Cliente inválido." }, { status: 400, headers: noStore });
        const db = (await import("@/integrations/supabase/client.server"))
          .supabaseAdmin as unknown as Banco;
        const c = await db
          .from("clients")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("name");
        if (c.error || !c.data?.length)
          return Response.json(
            { error: "Não consegui excluir." },
            { status: 500, headers: noStore },
          );
        // tira o cartão do Gestor IA e desliga as agendas de relatório desse cliente
        await db.from("gestor_painel").delete().eq("client_id", id);
        const rel = await db.from("report_configs").select("id").eq("client_id", id);
        const ids = ((rel.data ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (ids.length)
          await db.from("report_schedules").update({ active: false }).in("report_config_id", ids);
        return Response.json({ ok: true, nome: c.data[0].name }, { headers: noStore });
      },
    },
  },
});
