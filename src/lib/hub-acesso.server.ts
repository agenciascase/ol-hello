/**
 * Acesso único do HUB. O e-mail da conta fica SÓ no servidor (HUB_EMAIL) e nunca vai para o navegador:
 * a tela pede só a senha e o servidor faz o login.
 *
 * Primeiro acesso: criar a senha exige o código de instalação (HUB_CODIGO_INSTALACAO ou, se não houver,
 * o SCASE_CRON_SECRET), para que ninguém de fora crie a senha antes do dono.
 * Proteção contra tentativas: 5 erros por IP em 15 min, ou 30 erros no total, bloqueiam por 15 min.
 */
export const emailDoHub = () =>
  (process.env["HUB_EMAIL"] || "agenciascase@gmail.com").toLowerCase();

export async function banco() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function senhaJaCriada() {
  const db = await banco();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error("Não consegui consultar o acesso.");
  return (data.users ?? []).length > 0;
}

export const json = (corpo: unknown, status = 200) =>
  Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export function origemConfere(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

// ---------- limite de tentativas ----------
const JANELA = 15 * 60_000;
const MAX_POR_IP = 5;
const MAX_TOTAL = 30;
const erros = new Map<string, number[]>();

function ipDe(request: Request) {
  const xf = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || request.headers.get("x-real-ip") || "desconhecido";
}
function recentes(chave: string) {
  const agora = Date.now();
  const lista = (erros.get(chave) ?? []).filter((t) => agora - t < JANELA);
  erros.set(chave, lista);
  return lista;
}
export function bloqueado(request: Request) {
  return recentes(ipDe(request)).length >= MAX_POR_IP || recentes("*").length >= MAX_TOTAL;
}
export function anotarErro(request: Request) {
  const agora = Date.now();
  for (const chave of [ipDe(request), "*"]) erros.set(chave, [...recentes(chave), agora]);
}
export function limparErros(request: Request) {
  erros.delete(ipDe(request));
}
export const MSG_BLOQUEIO = "Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo.";

// ---------- comparação em tempo constante ----------
export async function iguais(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x),
    v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i]! ^ v[i]!;
  return diff === 0;
}

export function codigoDeInstalacao() {
  return process.env["HUB_CODIGO_INSTALACAO"] || process.env["SCASE_CRON_SECRET"] || "";
}

/** Login com a senha: o servidor completa o e-mail e devolve a sessão do Supabase. */
export async function loginComSenha(senha: string) {
  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
  const chave = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (!url || !chave) throw new Error("configuração");
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: chave, "content-type": "application/json" },
    body: JSON.stringify({ email: emailDoHub(), password: senha }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { access_token?: string; refresh_token?: string };
  return d.access_token && d.refresh_token
    ? { access_token: d.access_token, refresh_token: d.refresh_token }
    : null;
}
