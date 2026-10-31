import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isAuthenticatedAgencyAdmin } from "../../lib/integration-security.server";
import { sincronizarGestor } from "../../lib/gestor.server";

// Atualiza os cartões do Scase Gestor (só leitura na Meta e no Google).
// Chamado pelo agendador do GitHub (SCASE_CRON_SECRET), pelo agendador da Lovable (LOVABLE_CRON_SECRET)
// ou pelo botão "Atualizar agora" da página /gestor (sessão de administrador).
// Cada chamada faz um lote pequeno e devolve quantos faltam; o agendador chama de novo até zerar.
async function segredoConfere(request: Request) {
  const secret = process.env["SCASE_CRON_SECRET"] ?? "";
  const got = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (secret.length < 24 || got.length !== secret.length) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(got)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

async function autorizado(request: Request) {
  if (await segredoConfere(request)) return true;
  if (await isAuthenticatedAgencyAdmin(request)) return true;
  return (await authenticateCronRequest(request)) === null;
}

async function rodar(request: Request) {
  if (!(await autorizado(request)))
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(request.url);
  const cliente = url.searchParams.get("cliente") ?? undefined;
  if (cliente && !/^[0-9a-f-]{36}$/i.test(cliente))
    return Response.json({ error: "Cliente inválido" }, { status: 400 });
  try {
    const r = await sincronizarGestor({
      limite: Number(url.searchParams.get("limite") ?? 4),
      ...(cliente ? { clienteId: cliente } : {}),
    });
    return Response.json(
      { ranAt: new Date().toISOString(), ...r },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao atualizar o Gestor" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/cron/gestor")({
  server: {
    handlers: { POST: ({ request }) => rodar(request), GET: ({ request }) => rodar(request) },
  },
});
