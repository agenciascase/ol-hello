/**
 * Tarefas do HUB na Hostinger (servidor Node que fica ligado o tempo todo).
 * O Cron da Hostinger chama /api/cron/hub com o SCASE_CRON_SECRET e o servidor faz o trabalho
 * em segundo plano (o Cron não precisa esperar).
 *
 *  - gestor     : atualiza todos os cartões do Gestor IA (só leitura na Meta e no Google), das 6h às 22h.
 *  - relatorios : envia os relatórios agendados e chama o Claude se algum pedido ficou parado.
 *  - backup     : cópia de segurança das tabelas importantes em arquivo na Hostinger (guarda 30 dias).
 *
 * Pedidos do Gestor IA: quando alguém confirma algo na página, o servidor chama a tarefa do Claude
 * (ROTINA_URL + ROTINA_TOKEN). A tarefa lê e responde a fila por /api/agente/pedidos (AGENTE_TOKEN).
 */
import { sincronizarGestor } from "./gestor.server";
import { runDueSchedules } from "./report-scheduler.server";

type Banco = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
async function banco(): Promise<Banco> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Banco;
}

// ---------- travas (uma rodada de cada tarefa por vez) ----------
const rodando = new Map<string, number>();
function pegarTrava(nome: string, maxMs: number) {
  const desde = rodando.get(nome);
  if (desde && Date.now() - desde < maxMs) return false;
  rodando.set(nome, Date.now());
  return true;
}
const soltarTrava = (nome: string) => rodando.delete(nome);

export function horaDeBrasilia(d = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(d),
  );
}

const ultimo: Record<string, unknown> = {};
export function ultimaRodada() {
  return { ...ultimo, rodando: [...rodando.keys()] };
}

// ---------- Gestor IA ----------
const GESTOR_MAX_MS = 14 * 60_000;
export function iniciarGestor(opts: { forcar?: boolean } = {}) {
  const h = horaDeBrasilia();
  if (!opts.forcar && (h < 6 || h > 22))
    return { iniciado: false, motivo: "fora do horário (6h às 22h)" };
  if (!pegarTrava("gestor", GESTOR_MAX_MS)) return { iniciado: false, motivo: "já está rodando" };
  void (async () => {
    const inicio = Date.now();
    let feitos = 0,
      erros = 0,
      semMudanca = 0,
      restantes = 0,
      rodadas = 0;
    try {
      for (; rodadas < 60 && Date.now() - inicio < GESTOR_MAX_MS;) {
        rodadas++;
        const r = await sincronizarGestor({ limite: 4 });
        feitos += r.feitos;
        semMudanca += r.sem_mudanca;
        erros += r.erros.length;
        restantes = r.restantes;
        if (r.restantes === 0) break;
      }
      ultimo["gestor"] = {
        fim: new Date().toISOString(),
        rodadas,
        feitos,
        sem_mudanca: semMudanca,
        erros,
        restantes,
      };
    } catch (e) {
      ultimo["gestor"] = {
        fim: new Date().toISOString(),
        erro: e instanceof Error ? e.message : "falha",
      };
    } finally {
      soltarTrava("gestor");
    }
  })();
  return { iniciado: true };
}

// ---------- Relatórios agendados ----------
export function iniciarRelatorios() {
  if (!pegarTrava("relatorios", 14 * 60_000)) return { iniciado: false, motivo: "já está rodando" };
  void (async () => {
    try {
      const r = await runDueSchedules();
      ultimo["relatorios"] = { fim: new Date().toISOString(), processados: r.length };
    } catch (e) {
      ultimo["relatorios"] = {
        fim: new Date().toISOString(),
        erro: e instanceof Error ? e.message : "falha",
      };
    } finally {
      soltarTrava("relatorios");
    }
  })();
  return { iniciado: true };
}

// ---------- Pedidos → tarefa do Claude ----------
export const STATUS_AGUARDANDO = ["pendente", "ativando"] as const;
const ROTINA_RE =
  /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;
let ultimoDisparo = 0;

async function pedidosAguardando() {
  const db = await banco();
  const { data, error } = await db
    .from("gestor_pedidos")
    .select("id,criado_em,atualizado_em")
    .in("status", STATUS_AGUARDANDO as unknown as string[]);
  if (error) throw new Error("Pedidos: " + error.message);
  return (data ?? []) as Array<{ id: string; criado_em: string; atualizado_em: string }>;
}

/** Chama a tarefa do Claude. Não chama de novo em menos de 45 s (uma rodada do Claude já pega a fila toda). */
export async function chamarClaude(motivo: string, opts: { forcar?: boolean } = {}) {
  const url = process.env["ROTINA_URL"] ?? "";
  const token = process.env["ROTINA_TOKEN"] ?? "";
  if (!ROTINA_RE.test(url) || !token)
    return { ok: false, erro: "tarefa do Claude não configurada (ROTINA_URL/ROTINA_TOKEN)" };
  if (!opts.forcar && Date.now() - ultimoDisparo < 45_000) return { ok: true, adiado: true };
  ultimoDisparo = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "HUB Scase: " + motivo.slice(0, 500) }),
      signal: AbortSignal.timeout(20_000),
    });
    ultimo["claude"] = { quando: new Date().toISOString(), codigo: res.status };
    return { ok: res.ok, codigo: res.status };
  } catch (e) {
    ultimo["claude"] = {
      quando: new Date().toISOString(),
      erro: e instanceof Error ? e.message : "falha",
    };
    return { ok: false, erro: "não consegui chamar a tarefa do Claude" };
  }
}

/** Depois de um pedido novo na página. */
export async function avisarPedidoNovo() {
  const fila = await pedidosAguardando();
  if (!fila.length) return { ok: true, pendentes: 0 };
  return {
    pendentes: fila.length,
    ...(await chamarClaude(`${fila.length} pedido(s) aguardando no Gestor IA`)),
  };
}

/** Rede de segurança (Cron): pedido parado há mais de 10 min e último disparo há mais de 15 min → chama de novo. */
export async function reacionarSeParado() {
  const fila = await pedidosAguardando();
  const parado = fila.some(
    (p) => Date.now() - Date.parse(p.atualizado_em || p.criado_em) > 10 * 60_000,
  );
  if (!parado || Date.now() - ultimoDisparo < 15 * 60_000)
    return { pendentes: fila.length, chamou: false };
  return {
    pendentes: fila.length,
    chamou: true,
    ...(await chamarClaude(`${fila.length} pedido(s) parado(s) no Gestor IA`, { forcar: true })),
  };
}

// ---------- Cópia de segurança ----------
const TABELAS_BACKUP = [
  "clients",
  "client_ad_accounts",
  "ad_accounts_catalog",
  "report_configs",
  "report_schedules",
  "report_deliveries",
  "gestor_pedidos",
  // credenciais ficam criptografadas (só abrem com SCASE_TOKEN_ENCRYPTION_KEY)
  "ads_connections",
  "delivery_channels",
];

export async function copiaDeSeguranca() {
  if (!pegarTrava("backup", 10 * 60_000)) return { ok: false, motivo: "já está rodando" };
  try {
    const [{ mkdir, readdir, rm, writeFile, chmod }, { join }, { gzipSync }, os] =
      await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
        import("node:zlib"),
        import("node:os"),
      ]);
    const db = await banco();
    const dados: Record<string, unknown[]> = {};
    for (const t of TABELAS_BACKUP) {
      const linhas: unknown[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await db
          .from(t)
          .select("*")
          .range(de, de + 999);
        if (error) throw new Error(`${t}: ${error.message}`);
        linhas.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      dados[t] = linhas;
    }
    const pasta = process.env["HUB_BACKUP_DIR"] || join(os.homedir(), "hub-backups");
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    const dia = new Date().toISOString().slice(0, 10);
    const arquivo = join(pasta, `hub-${dia}.json.gz`);
    await writeFile(
      arquivo,
      gzipSync(JSON.stringify({ criado_em: new Date().toISOString(), dados })),
      { mode: 0o600 },
    );
    await chmod(arquivo, 0o600);
    // guarda só os últimos 30 dias
    const antigos = (await readdir(pasta))
      .filter((f) => /^hub-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f))
      .sort()
      .slice(0, -30);
    await Promise.all(antigos.map((f) => rm(join(pasta, f))));
    const resumo = Object.fromEntries(Object.entries(dados).map(([t, l]) => [t, l.length]));
    ultimo["backup"] = {
      fim: new Date().toISOString(),
      arquivo: `hub-${dia}.json.gz`,
      linhas: resumo,
    };
    return { ok: true, arquivo: `hub-${dia}.json.gz`, linhas: resumo };
  } catch (e) {
    ultimo["backup"] = {
      fim: new Date().toISOString(),
      erro: e instanceof Error ? e.message : "falha",
    };
    return { ok: false, erro: e instanceof Error ? e.message : "falha" };
  } finally {
    soltarTrava("backup");
  }
}

// ---------- segredo comparado em tempo constante ----------
export async function segredoConfere(request: Request, nomeVariavel: string) {
  const secret = process.env[nomeVariavel] ?? "";
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
