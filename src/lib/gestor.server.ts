/**
 * Scase Gestor: monta o cartão de cada cliente (saldo, números, campanhas, nota e sugestões) direto da Meta e do
 * Google Ads, sem IA. É a mesma lógica do painel_v2.py do agente de tráfego, portada para o servidor do Dashboard.
 * SÓ LEITURA nas contas de anúncio: nada aqui pausa, ativa ou muda orçamento.
 */
import { agencyTokens } from "./report-data.server";
import { googleAdsVersion, googleHeaders } from "./ads-oauth.server";

const GRAPH = "https://graph.facebook.com/v24.0/";
const FUSO = "America/Sao_Paulo";
const IDADE_PADRAO_MIN = 12; // cartão mais novo que isso não é refeito na rodada automática

/* ───────────── tipos ───────────── */

type Num = number;
export type Saldo = {
  plataforma: "Meta" | "Google";
  conta: string;
  modo: string;
  restante: Num | null;
  gasto_dia: Num;
  status?: string;
  dias?: Num | null;
  texto?: string;
};
export type Campanha = {
  nome: string;
  plataforma: "Meta" | "Google";
  tipo: string;
  unidade: string;
  canal?: string | undefined;
  gasto: Num;
  resultado: Num;
  cliques: Num;
  impressoes: Num;
  gasto_ant: Num;
  resultado_ant: Num;
  seguidores?: Num;
  custo?: Num | null;
  custo_ant?: Num | null;
};
export type Sugestao = {
  id?: number;
  prioridade: string;
  titulo: string;
  motivo: string;
  campanha: string;
  plataforma?: string;
  tipo?: string;
  impacto?: string;
  desfazer?: string;
  acao_cliente?: boolean;
  orcamento?: boolean;
  execucao?: string;
  porque?: { importa: string; faco: string };
};
type Dia = { gasto: Num; resultado: Num; cliques: Num; impressoes: Num; meta?: Num; google?: Num };
export type PainelDoc = { nome: string; kpi: Kpi; saude: string; [extra: string]: unknown };

/* ───────────── datas e números ───────────── */

const hojeLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const somaDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (a: string, b: string) => {
  const out: string[] = [];
  for (let t = a; t <= b; t = somaDias(t, 1)) out.push(t);
  return out;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const SIMBOLO: Record<string, string> = { BRL: "R$ ", EUR: "€ ", USD: "US$ " };
const fmt = (moeda: string) => (v: number) =>
  (SIMBOLO[moeda] ?? "R$ ") +
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => (x * 100).toFixed(1).replace(".", ",") + "%";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── tipo de campanha (Meta), igual ao painel_dados.py ───────────── */

const MSG = "onsite_conversion.messaging_conversation_started_7d";
const COMPRA = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const TIPO: Record<string, string> = {
  mensagens: "Mensagens",
  engajamento: "Mensagens",
  leads: "Cadastros (leads)",
  trafego: "Tráfego",
  seguidores: "Tráfego",
  vendas: "Vendas",
  reconhecimento: "Reconhecimento",
};
export const UNIDADE: Record<string, string> = {
  Mensagens: "conversas",
  "Cadastros (leads)": "leads",
  Tráfego: "visitas ao perfil",
  Vendas: "compras",
  Reconhecimento: "pessoas alcançadas",
  "Conversões (Google)": "conversões",
};
const OBJ_API: Record<string, string> = {
  OUTCOME_SALES: "vendas",
  CONVERSIONS: "vendas",
  PRODUCT_CATALOG_SALES: "vendas",
  OUTCOME_LEADS: "leads",
  LEAD_GENERATION: "leads",
  MESSAGES: "mensagens",
  OUTCOME_TRAFFIC: "trafego",
  LINK_CLICKS: "trafego",
  OUTCOME_ENGAGEMENT: "engajamento",
  POST_ENGAGEMENT: "engajamento",
  OUTCOME_AWARENESS: "reconhecimento",
  REACH: "reconhecimento",
  BRAND_AWARENESS: "reconhecimento",
  VIDEO_VIEWS: "reconhecimento",
  OUTCOME_APP_PROMOTION: "app",
};
const OBJ_NOME: Array<[string, string[]]> = [
  ["mensagens", ["wpp", "whats", "msg", "mensag", "direct"]],
  ["seguidores", ["seguidor", "follow"]],
  ["leads", ["lead", "cadastro", "formul"]],
  ["vendas", ["venda", "conv", "compra", "catalog", "pmax", "shopping"]],
  ["reconhecimento", ["topo", "reconhec", "awareness", "alcance", "branding", "video view"]],
  ["trafego", ["trafego", "tráfego", "traffic", "clique"]],
  ["engajamento", ["engaj", "engag"]],
];
type MetaLinha = {
  campaign_name?: string;
  objective?: string;
  date_start?: string;
  actions?: Array<{ action_type: string; value: string }>;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  instagram_profile_visits?: string;
  instagram_profile_follow?: string;
};
const n = (v: unknown) => Number(v ?? 0) || 0;

export function tipoDe(l: MetaLinha): string {
  const obj = String(l.objective ?? "").toUpperCase();
  if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(obj)) return "Reconhecimento";
  const nome = String(l.campaign_name ?? "");
  if (/FORMUL[AÁ]RIO/.test(nome.toUpperCase())) return "Cadastros (leads)";
  const baixo = nome.toLowerCase();
  const porNome = OBJ_NOME.find(([, chaves]) => chaves.some((c) => baixo.includes(c)))?.[0];
  return TIPO[porNome ?? OBJ_API[obj] ?? "geral"] ?? "Tráfego";
}

export function resultado(tipo: string, l: MetaLinha): number {
  const a: Record<string, number> = {};
  for (const x of l.actions ?? []) a[x.action_type] = n(x.value);
  if (tipo === "Mensagens") return a[MSG] ?? 0;
  if (tipo === "Cadastros (leads)") return a["lead"] ?? a["onsite_conversion.lead_grouped"] ?? 0;
  if (tipo === "Tráfego") return n(l.instagram_profile_visits) || n(l.inline_link_clicks);
  if (tipo === "Vendas") return COMPRA.map((t) => a[t]).find((v) => v !== undefined) ?? 0;
  return n(l.reach);
}

/* ───────────── Meta ───────────── */

async function graph(url: string, token: string): Promise<Record<string, unknown>> {
  for (let tentativa = 0; ; tentativa++) {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string; code?: number };
    };
    if (res.ok) return body;
    const codigo = body.error?.code;
    if (tentativa < 2 && (codigo === 17 || codigo === 4 || codigo === 613 || codigo === 2)) {
      await espera(4000 * (tentativa + 1));
      continue;
    }
    throw new Error("Meta: " + (body.error?.message || "erro " + res.status));
  }
}

async function graphTudo(url: string, token: string, max = 20): Promise<MetaLinha[]> {
  const out: MetaLinha[] = [];
  let prox = url;
  for (let i = 0; i < max && prox; i++) {
    const body = (await graph(prox, token)) as { data?: MetaLinha[]; paging?: { next?: string } };
    out.push(...(body.data ?? []));
    const nx = body.paging?.next;
    prox = nx && nx.startsWith("https://graph.facebook.com/") ? nx : "";
  }
  return out;
}

const CAMPOS =
  "campaign_name,objective,spend,impressions,reach,inline_link_clicks,actions,instagram_profile_visits,instagram_profile_follow";

type Fonte = { campanhas: Campanha[]; dias: Map<string, [Num, Num, Num, Num]> };

/** Uma chamada só: insights por campanha e por dia nos últimos ~61 dias. Os totais de 7 dias saem da soma. */
async function metaCliente(
  token: string,
  conta: string,
  p7: [string, string],
  pa: [string, string],
  p60: [string, string],
): Promise<Fonte> {
  const q = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields: CAMPOS,
    limit: "500",
    time_range: JSON.stringify({ since: p60[0], until: p60[1] }),
  });
  const linhas = await graphTudo(`${GRAPH}${conta}/insights?${q}`, token);
  const camp = new Map<string, Campanha>();
  const dias = new Map<string, [Num, Num, Num, Num]>();
  for (const l of linhas) {
    const dia = String(l.date_start ?? "");
    const t = tipoDe(l);
    const res = resultado(t, l);
    const d = dias.get(dia) ?? [0, 0, 0, 0];
    d[0] += n(l.spend);
    if (t !== "Reconhecimento") d[1] += res;
    d[2] += n(l.inline_link_clicks);
    d[3] += n(l.impressions);
    dias.set(dia, d);
    const per = dia >= p7[0] && dia <= p7[1] ? "" : dia >= pa[0] && dia <= pa[1] ? "_ant" : null;
    if (per === null) continue;
    const nome = String(l.campaign_name ?? "");
    const c = camp.get(nome) ?? {
      nome,
      plataforma: "Meta",
      tipo: t,
      unidade: UNIDADE[t] ?? "resultados",
      gasto: 0,
      resultado: 0,
      cliques: 0,
      impressoes: 0,
      gasto_ant: 0,
      resultado_ant: 0,
      seguidores: 0,
    };
    if (per === "") {
      c.gasto += n(l.spend);
      c.resultado += res;
      c.cliques += n(l.inline_link_clicks);
      c.impressoes += n(l.impressions);
      c.seguidores = (c.seguidores ?? 0) + n(l.instagram_profile_follow);
    } else {
      c.gasto_ant += n(l.spend);
      c.resultado_ant += res;
    }
    camp.set(nome, c);
  }
  return { campanhas: [...camp.values()], dias };
}

async function saldoMeta(token: string, conta: string, gastoDia: number): Promise<Saldo> {
  const r = (await graph(
    `${GRAPH}${conta}?fields=balance,amount_spent,spend_cap,is_prepay_account,funding_source_details`,
    token,
  )) as {
    amount_spent?: string;
    spend_cap?: string;
    is_prepay_account?: boolean;
    funding_source_details?: { display_string?: string };
  };
  const cap = n(r.spend_cap),
    gasto = n(r.amount_spent);
  if (r.is_prepay_account) {
    const m = /R\$\s*([\d.]+,\d{2})/.exec(r.funding_source_details?.display_string ?? "");
    const restante = m
      ? Number(m[1]!.replace(/\./g, "").replace(",", "."))
      : Math.max(cap - gasto, 0) / 100;
    return { plataforma: "Meta", conta, modo: "Saldo pré-pago", restante, gasto_dia: gastoDia };
  }
  if (cap)
    return {
      plataforma: "Meta",
      conta,
      modo: "Limite de gastos da conta (cartão)",
      restante: Math.max(cap - gasto, 0) / 100,
      gasto_dia: gastoDia,
    };
  return {
    plataforma: "Meta",
    conta,
    modo: "Cartão sem limite",
    restante: null,
    gasto_dia: gastoDia,
  };
}

/* ───────────── Google ───────────── */

type GLinha = {
  campaign?: { name?: string; advertisingChannelType?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string | number;
    conversions?: string | number;
    clicks?: string | number;
    impressions?: string | number;
  };
  accountBudget?: {
    approvedSpendingLimitMicros?: string;
    totalAdjustmentsMicros?: string;
    amountServedMicros?: string;
  };
};
const direto = new Set<string>(); // contas que só respondem sem o cabeçalho da MCC (acesso direto)

async function gaql(token: string, cid: string, query: string): Promise<GLinha[]> {
  const chamar = async (semMcc: boolean) => {
    const cab = googleHeaders(token);
    if (semMcc) delete cab["login-customer-id"];
    return fetch(
      `https://googleads.googleapis.com/${googleAdsVersion()}/customers/${cid}/googleAds:searchStream`,
      {
        method: "POST",
        headers: cab,
        body: JSON.stringify({ query }),
        cache: "no-store",
      },
    );
  };
  let res = await chamar(direto.has(cid));
  if (res.status === 403 && !direto.has(cid)) {
    const alt = await chamar(true);
    if (alt.ok) direto.add(cid);
    res = alt;
  }
  if (!res.ok) throw new Error("Google (" + res.status + "): " + (await res.text()).slice(0, 160));
  const lotes = (await res.json()) as Array<{ results?: GLinha[] }>;
  return lotes.flatMap((b) => b.results ?? []);
}

async function googleCliente(
  token: string,
  cid: string,
  p7: [string, string],
  pa: [string, string],
  p60: [string, string],
): Promise<Fonte> {
  const linhas = await gaql(
    token,
    cid,
    `SELECT campaign.name, campaign.advertising_channel_type, segments.date, metrics.cost_micros,
    metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${p60[0]}' AND '${p60[1]}'`,
  );
  const camp = new Map<string, Campanha>();
  const dias = new Map<string, [Num, Num, Num, Num]>();
  for (const l of linhas) {
    const dia = l.segments?.date ?? "";
    const g = n(l.metrics?.costMicros) / 1e6,
      conv = n(l.metrics?.conversions),
      cl = n(l.metrics?.clicks),
      im = n(l.metrics?.impressions);
    const d = dias.get(dia) ?? [0, 0, 0, 0];
    d[0] += g;
    d[1] += conv;
    d[2] += cl;
    d[3] += im;
    dias.set(dia, d);
    const per = dia >= p7[0] && dia <= p7[1] ? "" : dia >= pa[0] && dia <= pa[1] ? "_ant" : null;
    if (per === null) continue;
    const nome = l.campaign?.name ?? "";
    const c = camp.get(nome) ?? {
      nome,
      plataforma: "Google",
      tipo: "Conversões (Google)",
      unidade: "conversões",
      canal: l.campaign?.advertisingChannelType,
      gasto: 0,
      resultado: 0,
      cliques: 0,
      impressoes: 0,
      gasto_ant: 0,
      resultado_ant: 0,
    };
    if (per === "") {
      c.gasto += g;
      c.resultado += conv;
      c.cliques += cl;
      c.impressoes += im;
    } else {
      c.gasto_ant += g;
      c.resultado_ant += conv;
    }
    camp.set(nome, c);
  }
  return { campanhas: [...camp.values()], dias };
}

async function saldoGoogle(token: string, cid: string, gastoDia: number): Promise<Saldo> {
  const linhas = await gaql(
    token,
    cid,
    `SELECT account_budget.status, account_budget.approved_spending_limit_micros,
    account_budget.amount_served_micros, account_budget.total_adjustments_micros FROM account_budget WHERE account_budget.status = 'APPROVED'`,
  );
  for (const l of linhas) {
    const b = l.accountBudget ?? {};
    if (b.approvedSpendingLimitMicros) {
      const rest =
        (n(b.approvedSpendingLimitMicros) + n(b.totalAdjustmentsMicros) - n(b.amountServedMicros)) /
        1e6;
      return {
        plataforma: "Google",
        conta: cid,
        modo: "Orçamento da conta",
        restante: Math.max(rest, 0),
        gasto_dia: gastoDia,
      };
    }
  }
  return {
    plataforma: "Google",
    conta: cid,
    modo: "Sem limite de orçamento",
    restante: null,
    gasto_dia: gastoDia,
  };
}

/* ───────────── regras de gestor (iguais ao painel_v2.py) ───────────── */

function classificar(s: Saldo, brl: (v: number) => string): Saldo {
  const r = s.restante,
    g = s.gasto_dia;
  if (r === null) Object.assign(s, { status: "ok", dias: null, texto: "Sem limite" });
  else if (r < 1) Object.assign(s, { status: "zerado", dias: 0, texto: "Sem saldo" });
  else {
    const dias = g > 0 ? r / g : null;
    s.dias = dias !== null ? Math.round(dias * 10) / 10 : null;
    s.status = dias !== null && dias <= 7 ? "acabando" : "ok";
    s.texto =
      `${brl(r)} · ` +
      (dias !== null && dias < 1
        ? "acaba hoje"
        : dias !== null
          ? `~${Math.floor(dias)} dias`
          : "sem gasto recente");
  }
  s.restante = r !== null ? r2(r) : null;
  s.gasto_dia = r2(g);
  return s;
}

function sugestoesRegras(
  saldo: Saldo[],
  campanhas: Campanha[],
  brl: (v: number) => string,
): Sugestao[] {
  const out: Sugestao[] = [];
  for (const s of saldo) {
    if (s.status === "zerado")
      out.push({
        prioridade: "alta",
        titulo: `Pedir recarga de saldo (${s.plataforma})`,
        motivo: "A conta está sem saldo e os anúncios não estão rodando.",
        campanha: "Conta",
        acao_cliente: true,
        plataforma: s.plataforma,
      });
    else if (s.status === "acabando")
      out.push({
        prioridade: (s.dias ?? 0) < 3 ? "alta" : "media",
        titulo: `Avisar o cliente para recarregar (${s.plataforma})`,
        motivo:
          `Restam ${brl(s.restante ?? 0)}, ` +
          ((s.dias ?? 0) < 1 ? "acaba hoje" : `cerca de ${Math.floor(s.dias ?? 0)} dia(s)`) +
          ` no ritmo atual de ${brl(s.gasto_dia)}/dia.`,
        campanha: "Conta",
        acao_cliente: true,
        plataforma: s.plataforma,
      });
  }
  for (const c of campanhas) {
    if (c.gasto >= 30 && c.resultado === 0 && c.tipo !== "Reconhecimento") {
      const u = c.unidade.endsWith("s") ? c.unidade.slice(0, -1) : c.unidade;
      out.push({
        prioridade: "alta",
        titulo: `Revisar campanha sem resultado: ${c.nome}`,
        motivo: `Gastou ${brl(c.gasto)} em 7 dias sem nenhum(a) ${u}.`,
        campanha: c.nome,
        plataforma: c.plataforma,
        tipo: "investigar",
        impacto: "Parar o desperdício ou corrigir o que trava a conversão.",
        desfazer: "Nenhuma alteração sem te mostrar antes.",
      });
    }
    if (c.custo && c.custo_ant && c.custo > c.custo_ant * 1.3 && c.gasto >= 30)
      out.push({
        prioridade: "media",
        titulo: `Custo por resultado subiu ${Math.floor((c.custo / c.custo_ant - 1) * 100)}%: ${c.nome}`,
        motivo: `Passou de ${brl(c.custo_ant)} para ${brl(c.custo)}. Vale revisar criativos, público ou palavras-chave.`,
        campanha: c.nome,
        plataforma: c.plataforma,
        tipo: "investigar",
        impacto: "Voltar o custo ao patamar da semana anterior.",
        desfazer: "Nenhuma alteração sem te mostrar antes.",
      });
    if (
      c.plataforma === "Google" &&
      c.canal === "SEARCH" &&
      c.impressoes >= 300 &&
      c.cliques / c.impressoes < 0.03
    )
      out.push({
        prioridade: "baixa",
        titulo: `Melhorar anúncios de pesquisa: ${c.nome}`,
        motivo: `Taxa de cliques de ${pct(c.cliques / c.impressoes)} (abaixo de 3%). Testar novos títulos e palavras-chave negativas.`,
        campanha: c.nome,
        plataforma: "Google",
        tipo: "anuncios_google",
        impacto: "Mais cliques pelo mesmo investimento e custo por conversão menor.",
        desfazer: "Pausar os anúncios novos e reativar os antigos.",
      });
  }
  return out;
}

const EXEC: Record<string, string> = {
  pausar_anuncio: "executa",
  publico: "executa",
  reduzir: "executa",
  redistribuir: "executa",
  escalar: "executa",
  palavras_chave: "executa",
  renomear: "executa",
  criativo: "prepara",
  anuncios_google: "prepara",
  monitorar: "investiga",
  pagina: "investiga",
  investigar: "investiga",
};
const POR_QUE: Record<string, [string, string]> = {
  criativo: [
    "Os anúncios estão cansando o público (frequência alta) ou chamando pouca atenção. Isso encarece cada resultado com o tempo.",
    "Preparo novos textos e sugestões de criativo e te mostro antes de subir qualquer coisa.",
  ],
  anuncios_google: [
    "Poucas pessoas que veem o anúncio clicam. No Google, isso piora a posição do anúncio e encarece o clique.",
    "Escrevo novos títulos e descrições e sugiro palavras negativas. Te mostro antes de subir.",
  ],
  investigar: [
    "O desempenho saiu do padrão e vale entender a causa antes de mexer.",
    "Analiso campanha, público, anúncios e destino e te respondo com a causa e a correção. Nada é alterado sem você ver.",
  ],
};
function completar(x: Sugestao) {
  if (x.acao_cliente) {
    x.execucao = "cliente";
    x.porque = {
      importa:
        "Sem saldo, os anúncios param e o algoritmo perde o ritmo de aprendizado. Voltar depois de uma parada costuma custar mais caro nos primeiros dias.",
      faco: "Nada muda na conta: o botão copia um aviso pronto para você mandar no grupo do cliente.",
    };
    return x;
  }
  const t = x.tipo ?? "investigar";
  x.execucao = EXEC[t] ?? "investiga";
  const [importa, faco] = POR_QUE[t] ?? POR_QUE["investigar"]!;
  x.porque = { importa, faco };
  return x;
}

export type Kpi = {
  gasto: Num;
  gasto_ant: Num;
  resultado: Num;
  resultado_ant: Num;
  cliques: Num;
  impressoes: Num;
  unidade: string;
  custo: Num | null;
  custo_ant: Num | null;
};

function avaliar(
  kpi: Kpi,
  saldo: Saldo[],
  diario: Array<{ gasto: number }>,
  campanhas: Campanha[],
  brl: (v: number) => string,
) {
  const fortes: string[] = [],
    melhorar: string[] = [];
  const u = kpi.unidade;
  const gasto = kpi.gasto,
    custo = kpi.custo,
    custoAnt = kpi.custo_ant;
  const res = kpi.resultado,
    resAnt = kpi.resultado_ant;
  let nota = 7;
  if (!gasto) {
    const txt = saldo.some((s) => s.status === "zerado")
      ? "A conta está parada por falta de saldo. Sem recarga não há entrega nem dado para otimizar."
      : "A conta não teve gasto no período. Vale confirmar com o cliente se as campanhas devem voltar.";
    return { nota: null, resumo: txt, fortes: [], melhorar: [txt] };
  }
  if (custo && custoAnt) {
    const v = (custo / custoAnt - 1) * 100;
    if (v <= -10) {
      fortes.push(
        `Custo por resultado caiu ${Math.abs(v).toFixed(0)}% (${brl(custoAnt)} → ${brl(custo)}). A conta está ficando mais eficiente.`,
      );
      nota += 1.5;
    } else if (v >= 25) {
      melhorar.push(
        `Custo por resultado subiu ${v.toFixed(0)}% (${brl(custoAnt)} → ${brl(custo)}). Revisar criativos e público antes de aumentar verba.`,
      );
      nota -= 2;
    } else fortes.push(`Custo por resultado estável em ${brl(custo)}.`);
  }
  if (resAnt) {
    const v = (res / resAnt - 1) * 100;
    if (v >= 10) {
      fortes.push(`${Math.floor(res)} ${u} na semana, ${v.toFixed(0)}% a mais que a anterior.`);
      nota += 0.5;
    } else if (v <= -20) {
      melhorar.push(
        `Volume caiu ${Math.abs(v).toFixed(0)}%: ${Math.floor(res)} ${u} contra ${Math.floor(resAnt)} na semana anterior.`,
      );
      nota -= 1;
    }
  } else if (res) fortes.push(`${Math.floor(res)} ${u} no período.`);
  const conv = campanhas.filter((c) => c.tipo !== "Reconhecimento" && c.gasto > 0);
  const mortas = conv.filter((c) => c.gasto >= 30 && !c.resultado);
  if (mortas.length) {
    melhorar.push(
      `${mortas.length} campanha(s) gastaram ${brl(mortas.reduce((s, c) => s + c.gasto, 0))} sem resultado: ${mortas
        .slice(0, 2)
        .map((c) => c.nome.slice(0, 40))
        .join(", ")}.`,
    );
    nota -= 2;
  }
  for (const [plat, bom, ruim] of [
    ["Meta", 0.012, 0.007],
    ["Google", 0.06, 0.03],
  ] as const) {
    const cs = campanhas.filter((c) => c.plataforma === plat && c.impressoes);
    const imp = cs.reduce((s, c) => s + c.impressoes, 0),
      cli = cs.reduce((s, c) => s + c.cliques, 0);
    if (imp >= 1000) {
      const ctr = cli / imp;
      if (ctr >= bom) {
        fortes.push(
          `Anúncios ${plat} chamam atenção: taxa de cliques de ${pct(ctr)} (acima de ${pct(bom)}).`,
        );
        nota += 0.5;
      } else if (ctr < ruim) {
        melhorar.push(
          `Taxa de cliques baixa no ${plat}: ${pct(ctr)}. Testar novas chamadas e criativos para baratear o resultado.`,
        );
        nota -= 1;
      }
    }
  }
  if (conv.length >= 2) {
    const top = conv.reduce((a, b) => (b.gasto > a.gasto ? b : a));
    const part = top.gasto / conv.reduce((s, c) => s + c.gasto, 0);
    if (part >= 0.8)
      melhorar.push(
        `${(part * 100).toFixed(0)}% da verba está em uma campanha só (${top.nome.slice(0, 40)}). Diversificar reduz o risco se ela piorar.`,
      );
  } else if (conv.length === 1 && conv[0]!.resultado)
    fortes.push("Estrutura enxuta, com uma campanha concentrando o aprendizado do algoritmo.");
  const paradas = diario.slice(-14).filter((d) => !d.gasto).length;
  if (paradas >= 3) {
    melhorar.push(
      `A conta ficou ${paradas} dias sem gastar nas últimas duas semanas. Interrupções derrubam o aprendizado das campanhas.`,
    );
    nota -= 1;
  }
  for (const s of saldo) {
    if (s.status === "zerado") {
      melhorar.unshift(`Saldo ${s.plataforma} zerado: anúncios parados até a recarga.`);
      nota -= 2;
    } else if (s.status === "acabando") {
      melhorar.unshift(
        `Saldo ${s.plataforma} ` +
          ((s.dias ?? 0) < 1 ? "acaba hoje" : `acaba em ~${Math.floor(s.dias ?? 0)} dia(s)`) +
          ". Pedir recarga antes de parar.",
      );
      nota -= 0.5;
    }
  }
  nota = Math.max(0, Math.min(10, Math.round(nota * 10) / 10));
  const resumo =
    nota >= 8
      ? "Conta saudável: manter e escalar com cuidado."
      : nota >= 6
        ? "Conta com bons sinais, mas com ajustes que melhoram o custo."
        : nota >= 4
          ? "Conta precisa de atenção esta semana."
          : "Conta em situação crítica: priorizar os pontos abaixo.";
  return { nota, resumo, fortes: fortes.slice(0, 5), melhorar: melhorar.slice(0, 5) };
}

/* ───────────── cartão de um cliente ───────────── */

export type ClienteGestor = {
  id: string;
  name: string;
  gestor: string | null;
  contas: Array<{ provider: string; account_id: string; account_name: string | null }>;
  moedas: Record<string, string>;
};

export async function montarCartao(
  cli: ClienteGestor,
  tokens: { meta?: string; google?: string },
): Promise<PainelDoc> {
  const metas = cli.contas.filter((c) => c.provider === "meta" && c.account_id.startsWith("act_"));
  const googles = cli.contas.filter(
    (c) => c.provider === "google" && /^\d{10}$/.test(c.account_id.replace(/-/g, "")),
  );
  const moeda = cli.moedas[(metas[0] ?? googles[0])?.account_id ?? ""] || "BRL";
  const brl = fmt(moeda);
  const hoje = hojeLocal(),
    ontem = somaDias(hoje, -1);
  const p7: [string, string] = [somaDias(ontem, -6), ontem];
  const pa: [string, string] = [somaDias(p7[0], -7), somaDias(p7[0], -1)];
  const p30: [string, string] = [somaDias(ontem, -29), ontem];
  const p60: [string, string] = [somaDias(ontem, -59), hoje];
  const campanhas: Campanha[] = [],
    saldo: Saldo[] = [],
    plataformas: string[] = [],
    avisos: string[] = [];
  const dias = new Map<string, Dia>();
  const fontes: Array<["Meta" | "Google", string, Promise<Fonte>]> = [];
  for (const c of metas) {
    if (!tokens.meta) {
      avisos.push("Meta não conectada no Dashboard.");
      break;
    }
    fontes.push(["Meta", c.account_id, metaCliente(tokens.meta, c.account_id, p7, pa, p60)]);
  }
  for (const c of googles) {
    if (!tokens.google) {
      avisos.push("Google não conectado no Dashboard.");
      break;
    }
    const id = c.account_id.replace(/-/g, "");
    fontes.push(["Google", id, googleCliente(tokens.google, id, p7, pa, p60)]);
  }
  for (const [plat, conta, prom] of fontes) {
    let f: Fonte;
    try {
      f = await prom;
    } catch (e) {
      avisos.push(`${plat} ${conta}: ${e instanceof Error ? e.message : "erro"}`);
      continue;
    }
    if (!plataformas.includes(plat)) plataformas.push(plat);
    campanhas.push(...f.campanhas);
    for (const [dia, [g, r, cl, im]] of f.dias) {
      const d = dias.get(dia) ?? { gasto: 0, resultado: 0, cliques: 0, impressoes: 0 };
      d.gasto += g;
      d.resultado += r;
      d.cliques += cl;
      d.impressoes += im;
      const k = plat === "Meta" ? "meta" : "google";
      d[k] = r2((d[k] ?? 0) + g);
      dias.set(dia, d);
    }
    const g7 = f.campanhas.reduce((s, c) => s + c.gasto, 0) / 7;
    try {
      saldo.push(
        classificar(
          plat === "Meta"
            ? await saldoMeta(tokens.meta!, conta, g7)
            : await saldoGoogle(tokens.google!, conta, g7),
          brl,
        ),
      );
    } catch (e) {
      avisos.push(`Saldo ${plat}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  if (!plataformas.length && avisos.length) throw new Error(avisos.join(" | "));
  for (const c of campanhas) {
    c.custo = c.resultado ? r2(c.gasto / c.resultado) : null;
    c.custo_ant = c.resultado_ant ? r2(c.gasto_ant / c.resultado_ant) : null;
    for (const k of [
      "gasto",
      "gasto_ant",
      "resultado",
      "resultado_ant",
      "cliques",
      "impressoes",
    ] as const)
      c[k] = r2(c[k]);
  }
  const ativas = campanhas
    .filter((c) => c.gasto > 0 || c.gasto_ant > 0)
    .sort((a, b) => b.gasto - a.gasto);
  const conv = ativas.filter((c) => c.tipo !== "Reconhecimento");
  const soma = (k: keyof Campanha, cs = ativas) =>
    r2(cs.reduce((s, c) => s + Number(c[k] ?? 0), 0));
  const unidades = [...new Set(conv.map((c) => c.unidade))].sort(
    (a, b) =>
      conv.filter((c) => c.unidade === b).reduce((s, c) => s + c.gasto, 0) -
      conv.filter((c) => c.unidade === a).reduce((s, c) => s + c.gasto, 0),
  );
  const gConv = conv.reduce((s, c) => s + c.gasto, 0),
    gConvAnt = conv.reduce((s, c) => s + c.gasto_ant, 0);
  const resultadoTotal = soma("resultado", conv),
    resultadoAnt = soma("resultado_ant", conv),
    gastoTotal = soma("gasto");
  const kpi: Kpi = {
    gasto: gastoTotal,
    gasto_ant: soma("gasto_ant"),
    resultado: resultadoTotal,
    resultado_ant: resultadoAnt,
    cliques: soma("cliques"),
    impressoes: soma("impressoes"),
    unidade: unidades.length === 1 ? unidades[0]! : "resultados",
    custo: resultadoTotal && gastoTotal ? r2(gConv / resultadoTotal) : null,
    custo_ant: resultadoAnt ? r2(gConvAnt / resultadoAnt) : null,
  };
  const diario = diasEntre(p30[0], p30[1]).map((dia) => {
    const d = dias.get(dia);
    return {
      dia,
      gasto: r2(d?.gasto ?? 0),
      resultado: r2(d?.resultado ?? 0),
      ...(d?.meta !== undefined ? { meta: d.meta } : {}),
      ...(d?.google !== undefined ? { google: d.google } : {}),
    };
  });
  const serie = diasEntre(p60[0], p60[1]).map((dia) => {
    const d = dias.get(dia);
    return {
      dia,
      gasto: r2(d?.gasto ?? 0),
      resultado: r2(d?.resultado ?? 0),
      cliques: r2(d?.cliques ?? 0),
      impressoes: r2(d?.impressoes ?? 0),
    };
  });
  const ordem: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  const sugestoes = sugestoesRegras(saldo, ativas, brl)
    .sort((a, b) => (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3))
    .slice(0, 20)
    .map((s, i) => completar({ ...s, id: i + 1 }));
  const st = saldo.map((s) => s.status);
  const piorou = kpi.custo && kpi.custo_ant && kpi.custo > kpi.custo_ant * 1.25;
  let saude =
    st.includes("zerado") || (kpi.gasto > 30 && !kpi.resultado)
      ? "critico"
      : st.includes("acabando") || piorou
        ? "atencao"
        : "ok";
  if (!kpi.gasto && !st.includes("zerado")) saude = "parado";
  return {
    nome: cli.name,
    slug: cli.id,
    moeda,
    plataformas,
    gestor: cli.gestor,
    contas: {
      meta: metas.map((c) => c.account_id).join(", ") || null,
      google: googles.map((c) => c.account_id).join(", ") || null,
    },
    periodo: { de: p7[0], ate: p7[1] },
    saldo,
    kpi,
    diario,
    serie,
    campanhas: ativas.slice(0, 25),
    sugestoes,
    avaliacao: avaliar(kpi, saldo, diario, ativas, brl),
    saude,
    avisos,
    atualizado_em: new Date().toISOString(),
  };
}

/* ───────────── rodada de atualização ───────────── */

// As tabelas novas (gestor_*) ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { from: (t: string) => any };

/**
 * Atualiza até `limite` cartões, começando pelos mais antigos (ou só `clienteId`).
 * Pensado para ser chamado em sequência pelo agendador até `restantes` chegar a zero.
 */
/**
 * Resumo do cartão para a lista do Gestor IA (bem menor que o documento completo):
 * a lista baixa só isto; campanhas, textos das sugestões e avaliação completa vêm ao abrir o cliente.
 */
export function resumir(doc: PainelDoc) {
  const d = doc as unknown as {
    nome: string;
    plataformas?: string[];
    gestor?: string | null;
    moeda?: string;
    periodo?: unknown;
    saldo?: unknown;
    kpi?: unknown;
    saude?: string;
    avaliacao?: { nota?: number | null };
    avisos?: string[];
    atualizado_em?: string;
    sugestoes?: Array<{ id?: number; execucao?: string }>;
    serie?: Array<{
      dia: string;
      gasto: number;
      resultado: number;
      cliques: number;
      impressoes: number;
    }>;
  };
  const serie = d.serie ?? [];
  return {
    nome: d.nome,
    plataformas: d.plataformas ?? [],
    gestor: d.gestor ?? null,
    moeda: d.moeda ?? "BRL",
    periodo: d.periodo ?? null,
    saldo: d.saldo ?? [],
    kpi: d.kpi ?? null,
    saude: d.saude ?? "ok",
    avaliacao: { nota: d.avaliacao?.nota ?? null },
    sugestoes: (d.sugestoes ?? []).map((x) => ({ id: x.id, execucao: x.execucao })),
    serie: {
      de: serie[0]?.dia ?? null,
      g: serie.map((x) => x.gasto),
      r: serie.map((x) => x.resultado),
      c: serie.map((x) => x.cliques),
      i: serie.map((x) => x.impressoes),
    },
    avisos: d.avisos ?? [],
    atualizado_em: d.atualizado_em ?? null,
  };
}

/** Impressão digital do conteúdo (sem a hora): igual = nada mudou, não precisa gravar nem baixar de novo. */
async function impressao(doc: PainelDoc) {
  const { atualizado_em: _hora, ...resto } = doc as PainelDoc & { atualizado_em?: string };
  void _hora;
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(resto)),
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Atualiza até `limite` cartões, começando pelos conferidos há mais tempo (ou só `clienteId`).
 * Cartão que não mudou só tem a hora da conferência anotada (`conferido_em`); o conteúdo e o
 * `updated_at` só mudam quando os números mudam, então a página não baixa de novo à toa.
 * Pensado para ser chamado em sequência pelo agendador até `restantes` chegar a zero.
 */
export async function sincronizarGestor(
  opts: { limite?: number; clienteId?: string; idadeMin?: number } = {},
) {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const limite = Math.max(1, Math.min(opts.limite ?? 4, 10));
  const idadeMs = (opts.idadeMin ?? IDADE_PADRAO_MIN) * 60_000;
  const sb = db as unknown as Banco;
  const [clientes, painel, catalogo] = await Promise.all([
    sb
      .from("clients")
      .select("id,name,gestor,active,client_ad_accounts(provider,account_id,account_name)")
      .eq("active", true),
    sb.from("gestor_painel").select("client_id,conferido_em,hash"),
    sb.from("ad_accounts_catalog").select("account_id,currency"),
  ]);
  if (clientes.error) throw new Error("Clientes: " + clientes.error.message);
  if (painel.error) throw new Error("Tabela gestor_painel: " + painel.error.message);
  const linhas =
    (painel.data as Array<{
      client_id: string;
      conferido_em: string | null;
      hash: string | null;
    }> | null) ?? [];
  const quando = new Map(
    linhas.map((p) => [p.client_id, p.conferido_em ? Date.parse(p.conferido_em) : 0]),
  );
  const hashes = new Map(linhas.map((p) => [p.client_id, p.hash]));
  const moedas = Object.fromEntries(
    ((catalogo.data as Array<{ account_id: string; currency: string }> | null) ?? []).map((c) => [
      c.account_id,
      c.currency,
    ]),
  );
  type Linha = {
    id: string;
    name: string;
    gestor: string | null;
    client_ad_accounts: ClienteGestor["contas"];
  };
  const todos = ((clientes.data ?? []) as Linha[]).filter((c) => c.client_ad_accounts?.length);
  // cliente desativado (ou sem conta de anúncio) sai do Gestor IA
  const ativos = new Set(todos.map((c) => c.id));
  const sobrando = linhas.map((p) => p.client_id).filter((id) => !ativos.has(id));
  if (todos.length && sobrando.length)
    for (let i = 0; i < sobrando.length; i += 50)
      await sb
        .from("gestor_painel")
        .delete()
        .in("client_id", sobrando.slice(i, i + 50));
  const agora = Date.now();
  const fila = opts.clienteId
    ? todos.filter((c) => c.id === opts.clienteId)
    : todos
        .filter((c) => !quando.has(c.id) || agora - quando.get(c.id)! > idadeMs)
        .sort((a, b) => (quando.get(a.id) ?? 0) - (quando.get(b.id) ?? 0));
  const lote = fila.slice(0, limite);
  const tokens = await agencyTokens();
  const feitos: string[] = [],
    erros: Array<{ nome: string; erro: string }> = [];
  let iguais = 0;
  await Promise.all(
    lote.map(async (c) => {
      const hora = new Date().toISOString();
      try {
        const doc = await montarCartao(
          { id: c.id, name: c.name, gestor: c.gestor, contas: c.client_ad_accounts, moedas },
          tokens,
        );
        const hash = await impressao(doc);
        const r =
          hashes.get(c.id) === hash
            ? await sb
                .from("gestor_painel")
                .update({ conferido_em: hora, erro: null })
                .eq("client_id", c.id)
            : await sb.from("gestor_painel").upsert(
                {
                  client_id: c.id,
                  data: doc,
                  resumo: resumir(doc),
                  hash,
                  erro: null,
                  updated_at: hora,
                  conferido_em: hora,
                },
                { onConflict: "client_id" },
              );
        if (r.error) throw new Error(r.error.message);
        if (hashes.get(c.id) === hash) iguais++;
        feitos.push(c.name);
      } catch (e) {
        const erro = (e instanceof Error ? e.message : "erro").slice(0, 400);
        erros.push({ nome: c.name, erro });
        // marca a tentativa para a fila andar; o cartão anterior (se houver) continua no painel
        if (quando.has(c.id))
          await sb
            .from("gestor_painel")
            .update({ erro, conferido_em: hora, updated_at: hora })
            .eq("client_id", c.id);
        else
          await sb.from("gestor_painel").upsert(
            {
              client_id: c.id,
              data: { nome: c.name },
              resumo: { nome: c.name },
              erro,
              updated_at: hora,
              conferido_em: hora,
            },
            { onConflict: "client_id" },
          );
      }
    }),
  );
  return {
    feitos: feitos.length,
    sem_mudanca: iguais,
    erros,
    restantes: Math.max(fila.length - lote.length, 0),
    total: todos.length,
  };
}
