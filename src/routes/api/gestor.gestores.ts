import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin, UUID_RE } from "../../lib/agency-api.server";

// Gestores de um cliente no Gestor IA (pode ser mais de um). POST { client_id, gestores: string[] }.
// Grava em clients.gestor (nomes separados por vírgula) e já atualiza o cartão guardado,
// para a mudança aparecer na hora (sem esperar a próxima atualização).
const GESTORES = ["Augusto Venâncio", "Alecsander Chipoletti", "Matheus Aracema"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { from: (t: string) => any };

export const Route = createFileRoute("/api/gestor/gestores")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await requireAgencyAdmin(request, { mutating: true });
        if (negado) return negado;
        const corpo = (await request.json().catch(() => ({}))) as {
          client_id?: unknown;
          gestores?: unknown;
        };
        const id = typeof corpo.client_id === "string" ? corpo.client_id : "";
        if (!UUID_RE.test(id))
          return Response.json({ error: "Cliente inválido." }, { status: 400, headers: noStore });
        const lista = Array.isArray(corpo.gestores)
          ? GESTORES.filter((g) => (corpo.gestores as unknown[]).includes(g))
          : null;
        if (!lista)
          return Response.json(
            { error: "Lista de gestores inválida." },
            { status: 400, headers: noStore },
          );
        const texto = lista.length ? lista.join(", ") : null;
        const db = (await import("@/integrations/supabase/client.server"))
          .supabaseAdmin as unknown as Banco;
        const c = await db.from("clients").update({ gestor: texto }).eq("id", id).select("id");
        if (c.error || !c.data?.length)
          return Response.json(
            { error: "Não consegui salvar." },
            { status: 500, headers: noStore },
          );
        // cartão guardado: troca só o campo gestor (o resto continua igual)
        const g = await db
          .from("gestor_painel")
          .select("data,resumo")
          .eq("client_id", id)
          .maybeSingle();
        if (g.data) {
          const data = { ...(g.data.data ?? {}), gestor: texto };
          const resumo = g.data.resumo ? { ...g.data.resumo, gestor: texto } : g.data.resumo;
          // updated_at novo faz a página baixar o cartão de novo na hora
          await db
            .from("gestor_painel")
            .update({ data, resumo, updated_at: new Date().toISOString() })
            .eq("client_id", id);
        }
        return Response.json({ ok: true, gestores: lista }, { headers: noStore });
      },
    },
  },
});
