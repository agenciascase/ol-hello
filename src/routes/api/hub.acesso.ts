import { createFileRoute } from "@tanstack/react-router";

// Acesso único do HUB: uma conta só (agenciascase@gmail.com por padrão).
// GET  → diz se a senha já foi criada.
// POST → cria a senha uma única vez (primeiro acesso). Depois disso recusa sempre:
//        não existe trocar nem recuperar senha pelo sistema.
const EMAIL_HUB = () => (process.env["HUB_EMAIL"] || "agenciascase@gmail.com").toLowerCase();
const SENHA_MIN = 10;

async function banco() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function senhaJaCriada() {
  const db = await banco();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error("Não consegui consultar o acesso.");
  return (data.users ?? []).length > 0;
}

const json = (corpo: unknown, status = 200) =>
  Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

async function estado() {
  try {
    return json({ email: EMAIL_HUB(), senhaCriada: await senhaJaCriada() });
  } catch {
    return json({ error: "Acesso indisponível no momento." }, 503);
  }
}

async function criar(request: Request) {
  const origem = request.headers.get("origin");
  if (origem !== new URL(request.url).origin) return json({ error: "Origem não autorizada" }, 403);
  const corpo = (await request.json().catch(() => ({}))) as { senha?: unknown };
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  if (senha.length < SENHA_MIN || senha.length > 128)
    return json({ error: `A senha precisa ter de ${SENHA_MIN} a 128 caracteres.` }, 400);
  try {
    if (await senhaJaCriada())
      return json({ error: "A senha do HUB já foi criada. Use a tela Entrar." }, 409);
    const db = await banco();
    const { data, error } = await db.auth.admin.createUser({
      email: EMAIL_HUB(),
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: "Agência Scase", company: "SCASE" },
    });
    if (error || !data.user)
      return json({ error: "A senha do HUB já foi criada. Use a tela Entrar." }, 409);
    // a conta única é a administradora do HUB
    await (
      db as unknown as {
        from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<unknown> };
      }
    )
      .from("user_roles")
      .upsert({ user_id: data.user.id, role: "admin" }, { onConflict: "user_id,role" });
    return json({ ok: true, email: EMAIL_HUB() });
  } catch {
    return json({ error: "Não consegui criar a senha agora. Tente de novo." }, 500);
  }
}

export const Route = createFileRoute("/api/hub/acesso")({
  server: { handlers: { GET: () => estado(), POST: ({ request }) => criar(request) } },
});
