import { createFileRoute } from "@tanstack/react-router";
import {
  anotarErro,
  banco,
  bloqueado,
  codigoDeInstalacao,
  emailDoHub,
  iguais,
  json,
  limparErros,
  MSG_BLOQUEIO,
  origemConfere,
  problemasDeConfiguracao,
  senhaJaCriada,
} from "../../lib/hub-acesso.server";

// Acesso único do HUB (o e-mail fica só no servidor).
// GET  → diz só se a senha já foi criada.
// POST → { email, senha, codigo } cria a senha uma única vez (primeiro acesso), com o código de instalação.
//        Depois disso recusa sempre: não existe trocar nem recuperar senha pelo sistema.
const SENHA_MIN = 10;

async function estado() {
  try {
    return json({ senhaCriada: await senhaJaCriada() });
  } catch (e) {
    // diz o que conferir na Hostinger (nunca mostra valores)
    const problemas = problemasDeConfiguracao();
    const detalhe = problemas.length
      ? problemas
      : [e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido"];
    return json({ error: "O HUB não conseguiu falar com o banco de dados.", detalhe }, 503);
  }
}

async function criar(request: Request) {
  if (!origemConfere(request)) return json({ error: "Origem não autorizada" }, 403);
  if (bloqueado(request)) return json({ error: MSG_BLOQUEIO }, 429);
  const corpo = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    senha?: unknown;
    codigo?: unknown;
  };
  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim() : "";
  const esperado = codigoDeInstalacao();
  if (!esperado) return json({ error: "Código de instalação não configurado no servidor." }, 503);
  // e-mail e código conferidos juntos, com a mesma resposta (não dá pista de qual está errado)
  const codigoOk = await iguais(codigo, esperado);
  if (!codigoOk || email !== emailDoHub()) {
    anotarErro(request);
    return json({ error: "E-mail ou código de instalação incorretos." }, 403);
  }
  if (senha.length < SENHA_MIN || senha.length > 128)
    return json({ error: `A senha precisa ter de ${SENHA_MIN} a 128 caracteres.` }, 400);
  try {
    if (await senhaJaCriada())
      return json({ error: "A senha do HUB já foi criada. Use a tela Entrar." }, 409);
    const db = await banco();
    const { data, error } = await db.auth.admin.createUser({
      email: emailDoHub(),
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
    limparErros(request);
    return json({ ok: true });
  } catch {
    return json({ error: "Não consegui criar a senha agora. Tente de novo." }, 500);
  }
}

export const Route = createFileRoute("/api/hub/acesso")({
  server: { handlers: { GET: () => estado(), POST: ({ request }) => criar(request) } },
});
