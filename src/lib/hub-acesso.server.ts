/**
 * Acesso único do HUB. O e-mail da conta fica SÓ no servidor (HUB_EMAIL) e nunca vai para o navegador:
 * a tela pede só a senha e o servidor faz o login.
 *
 * Primeiro acesso: criar a senha exige o código de instalação (HUB_CODIGO_INSTALACAO ou, se não houver,
 * o SCASE_CRON_SECRET), para que ninguém de fora crie a senha antes do dono.
 * Proteção contra tentativas: 5 erros por IP em 15 min, ou 30 erros no total, bloqueiam por 15 min.
 */
import { origemDoSite } from "./origem.server";

export const emailDoHub = () =>
  (process.env["HUB_EMAIL"] || "agenciascase@gmail.com").toLowerCase();

export async function banco() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function senhaJaCriada() {
  const db = await banco();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error("Supabase respondeu: " + (error.message || "erro sem mensagem"));
  return (data.users ?? []).length > 0;
}

/**
 * Diagnóstico das variáveis do banco, SEM mostrar valores: só diz o que está faltando ou com cara errada.
 * Aparece na tela "HUB indisponível" para o dono corrigir na Hostinger.
 */
export function problemasDeConfiguracao() {
  const p: string[] = [];
  const bruto = (n: string) => process.env[n] ?? "";
  const url = bruto("SUPABASE_URL");
  const pub = bruto("SUPABASE_PUBLISHABLE_KEY");
  const sec = bruto("SUPABASE_SERVICE_ROLE_KEY");
  const sobra = (v: string) => v !== v.trim() || /["']/.test(v);
  if (!url) p.push("SUPABASE_URL está vazia ou não existe.");
  else if (sobra(url)) p.push("SUPABASE_URL tem espaço ou aspas sobrando.");
  else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url))
    p.push("SUPABASE_URL não está no formato https://xxxx.supabase.co.");
  if (!pub) p.push("SUPABASE_PUBLISHABLE_KEY está vazia ou não existe.");
  else if (sobra(pub)) p.push("SUPABASE_PUBLISHABLE_KEY tem espaço ou aspas sobrando.");
  else if (!pub.startsWith("sb_publishable_") && !pub.startsWith("eyJ"))
    p.push("SUPABASE_PUBLISHABLE_KEY deveria começar com sb_publishable_.");
  if (!sec) p.push("SUPABASE_SERVICE_ROLE_KEY está vazia ou não existe.");
  else if (sobra(sec)) p.push("SUPABASE_SERVICE_ROLE_KEY tem espaço ou aspas sobrando.");
  else if (sec.startsWith("sbp_"))
    p.push("SUPABASE_SERVICE_ROLE_KEY é a chave PESSOAL (sbp_). Use a Secret key (sb_secret_).");
  else if (sec.startsWith("sb_publishable_"))
    p.push("SUPABASE_SERVICE_ROLE_KEY é a chave PÚBLICA. Use a Secret key (sb_secret_).");
  else if (!sec.startsWith("sb_secret_") && !sec.startsWith("eyJ"))
    p.push("SUPABASE_SERVICE_ROLE_KEY deveria começar com sb_secret_.");
  else if (sec.startsWith("sb_secret_") && sec.length < 30)
    p.push("SUPABASE_SERVICE_ROLE_KEY parece incompleta (copie de novo pelo botão de copiar).");
  return p;
}

export const json = (corpo: unknown, status = 200) =>
  Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export function origemConfere(request: Request) {
  return origemDoSite(request);
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
