// Pure helpers for the full report: shared types, goals, budget pacing, taxes, highlights and the
// suggested manager analysis. No Node or browser APIs, so it runs on the server, in the panel and in tests.
import { formatMetric, metricValue, variation, type MetricKey, type ReportTotals } from "./report-metrics";

export type Platform = "meta" | "google";
export type Objective = "leads" | "sales" | "traffic" | "awareness";

export const OBJECTIVES: Record<Objective, { label: string; description: string; primary: MetricKey[] }> = {
  leads: { label: "Geração de leads", description: "Leads, conversas e custo por resultado em destaque", primary: ["conversions", "cpa", "spend", "ctr"] },
  sales: { label: "Vendas / e-commerce", description: "Receita, ROAS e custo por venda em destaque", primary: ["revenue", "roas", "conversions", "cpa"] },
  traffic: { label: "Tráfego", description: "Cliques, CTR e custo por clique em destaque", primary: ["clicks", "ctr", "cpc", "spend"] },
  awareness: { label: "Alcance e marca", description: "Alcance, impressões e CPM em destaque", primary: ["reach", "impressions", "cpm", "frequency"] },
};
export const isObjective = (v: string): v is Objective => v in OBJECTIVES;

export const SECTIONS = [
  ["highlights", "Destaques automáticos"],
  ["goals", "Metas e ritmo da verba"],
  ["analysis", "Análise do gestor, ações e próximos passos"],
  ["daily", "Evolução diária"],
  ["funnel", "Funil"],
  ["conversions", "Conversões por tipo"],
  ["platforms", "Resultado por plataforma"],
  ["campaigns", "Campanhas"],
  ["creatives", "Melhores criativos (Meta)"],
  ["search_terms", "Termos de pesquisa (Google)"],
  ["audience", "Público (idade, região, dispositivo)"],
  ["history", "Histórico de 6 meses"],
  ["glossary", "Glossário e nota de atribuição"],
] as const;
export type SectionKey = (typeof SECTIONS)[number][0];
export const ALL_SECTIONS: SectionKey[] = SECTIONS.map(([k]) => k);

export type DailyPoint = { date: string; spend: number; impressions: number; clicks: number; conversions: number };
export type ConversionType = { platform: Platform; label: string; value: number };
export type Funnel = { impressions: number; clicks: number; landingPageViews: number | null; conversions: number };
export type Creative = { id: string; name: string; thumbnail: string | null; imageNote?: string | null; spend: number; impressions: number; clicks: number; conversions: number };
export type SearchTerm = { term: string; impressions: number; clicks: number; conversions: number; spend: number };
export type AudienceRow = { label: string; spend: number; impressions: number; clicks: number; conversions: number };
export type Audience = { ageGender: AudienceRow[]; region: AudienceRow[]; device: AudienceRow[]; placement: AudienceRow[] };
export type MonthPoint = { month: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number };
export type Status = "ok" | "warn" | "bad";
export type GoalRow = { key: "conversions" | "cpa" | "roas"; label: string; target: number; actual: number | null; status: Status; text: string };
export type Pacing = { budget: number; spentMonth: number; expectedToDate: number; projection: number; dayOfMonth: number; daysInMonth: number; status: Status; text: string };
export type CampaignRow = ReportTotals & { name: string; platform: Platform; account: string };

/** Everything a full report carries; produced on the server, rendered by the panel, the PDF and the e-mail. */
export type FullReport = {
  clientName: string;
  logoUrl: string | null;
  reportName: string;
  /** Campaign-name filter applied to the report, if any. */
  campaignFilter: string | null;
  intro: string | null;
  objective: Objective;
  sections: SectionKey[];
  metrics: string[];
  period: string;
  range: { since: string; until: string; prevSince: string; prevUntil: string };
  compare: boolean;
  total: { current: ReportTotals; previous: ReportTotals | null };
  byPlatform: Partial<Record<Platform, { current: ReportTotals; previous: ReportTotals | null }>>;
  campaigns: CampaignRow[];
  daily: DailyPoint[];
  conversionTypes: ConversionType[];
  funnel: Funnel;
  creatives: Creative[];
  searchTerms: SearchTerm[];
  audience: Audience;
  history: MonthPoint[];
  goals: GoalRow[];
  pacing: Pacing | null;
  taxes: { meta: number; google: number; spendWithTax: number | null };
  analysis: { notes: string | null; actions: string | null; nextSteps: string | null };
  highlights: string[];
  errors: string[];
  generatedAt: string;
};

export type ClientGoals = { monthly_budget: number | null; goal_cpa: number | null; goal_conversions_month: number | null; goal_roas: number | null };

const brl = (n: number) => formatMetric("spend", n);
const int = (n: number) => formatMetric("conversions", Math.round(n * 100) / 100);
const pct = (n: number) => `${Math.round(n)}%`;

export const daysBetween = (since: string, until: string) => Math.round((Date.parse(until + "T00:00:00Z") - Date.parse(since + "T00:00:00Z")) / 86_400_000) + 1;
const daysInMonthOf = (isoDate: string) => {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, m ?? 1, 0)).getUTCDate();
};

/** Compares the period's results with the client's monthly goals, scaled to the period length. */
export function evaluateGoals(goals: ClientGoals, total: ReportTotals, range: { since: string; until: string }): GoalRow[] {
  const rows: GoalRow[] = [];
  const days = daysBetween(range.since, range.until);
  if (goals.goal_conversions_month) {
    const target = (goals.goal_conversions_month * days) / 30.4;
    const ratio = total.conversions / target;
    rows.push({
      key: "conversions",
      label: "Conversões no período",
      target,
      actual: total.conversions,
      status: ratio >= 1 ? "ok" : ratio >= 0.8 ? "warn" : "bad",
      text: `${int(total.conversions)} de ${int(target)} esperadas para ${days} dias (${pct(ratio * 100)} da meta).`,
    });
  }
  if (goals.goal_cpa) {
    const cpa = metricValue("cpa", total);
    const ratio = cpa === null ? null : cpa / goals.goal_cpa;
    rows.push({
      key: "cpa",
      label: "Custo por conversão",
      target: goals.goal_cpa,
      actual: cpa,
      status: ratio === null ? "bad" : ratio <= 1 ? "ok" : ratio <= 1.2 ? "warn" : "bad",
      text: cpa === null ? `Sem conversões no período (meta de ${brl(goals.goal_cpa)}).` : `${brl(cpa)} contra meta de até ${brl(goals.goal_cpa)}.`,
    });
  }
  if (goals.goal_roas) {
    const roas = metricValue("roas", total);
    const ratio = roas === null ? null : roas / goals.goal_roas;
    rows.push({
      key: "roas",
      label: "ROAS",
      target: goals.goal_roas,
      actual: roas,
      status: ratio === null ? "bad" : ratio >= 1 ? "ok" : ratio >= 0.8 ? "warn" : "bad",
      text: roas === null ? `Sem receita atribuída (meta de ${formatMetric("roas", goals.goal_roas)}).` : `${formatMetric("roas", roas)} contra meta de ${formatMetric("roas", goals.goal_roas)}.`,
    });
  }
  return rows;
}

/** Month-to-date spend versus the monthly budget, with an end-of-month projection. `today` is YYYY-MM-DD in the client's time zone. */
export function evaluatePacing(budget: number | null, spentMonth: number | null, today: string): Pacing | null {
  if (!budget || spentMonth === null) return null;
  // On the 1st there is no complete day of the month yet.
  if (Number(today.slice(8, 10)) <= 1) return null;
  const dim = daysInMonthOf(today);
  // Data is complete through yesterday, so the elapsed share counts full days only.
  const elapsed = Math.max(1, Number(today.slice(8, 10)) - 1);
  const expected = (budget * elapsed) / dim;
  const projection = (spentMonth / elapsed) * dim;
  const ratio = projection / budget;
  const status: Status = ratio >= 0.9 && ratio <= 1.1 ? "ok" : ratio >= 0.75 && ratio <= 1.25 ? "warn" : "bad";
  const text =
    status === "ok"
      ? `Ritmo dentro do planejado: projeção de ${brl(projection)} para uma verba de ${brl(budget)}.`
      : ratio > 1
        ? `Ritmo acima do planejado: projeção de ${brl(projection)} para uma verba de ${brl(budget)} (${pct(ratio * 100)}).`
        : `Ritmo abaixo do planejado: projeção de ${brl(projection)} para uma verba de ${brl(budget)} (${pct(ratio * 100)}).`;
  return { budget, spentMonth, expectedToDate: expected, projection, dayOfMonth: elapsed, daysInMonth: dim, status, text };
}

export function spendWithTaxes(byPlatform: Partial<Record<Platform, { current: ReportTotals }>>, tax: { meta: number; google: number }) {
  const meta = byPlatform.meta?.current.spend ?? 0;
  const google = byPlatform.google?.current.spend ?? 0;
  if (!tax.meta && !tax.google) return null;
  return meta * (1 + tax.meta / 100) + google * (1 + tax.google / 100);
}

type HighlightInput = {
  objective: Objective;
  total: { current: ReportTotals; previous: ReportTotals | null };
  byPlatform: Partial<Record<Platform, { current: ReportTotals }>>;
  campaigns: Array<ReportTotals & { name: string }>;
  goals: GoalRow[];
  pacing: Pacing | null;
};

/** Up to four plain-language highlights: main change, best campaign, platform split and a point of attention. */
export function buildHighlights(input: HighlightInput): string[] {
  const out: string[] = [];
  const { current, previous } = input.total;
  const mainKey = input.objective === "sales" ? "revenue" : input.objective === "traffic" ? "clicks" : input.objective === "awareness" ? "impressions" : "conversions";
  const mainLabel = { revenue: "A receita atribuída", clicks: "Os cliques", impressions: "As impressões", conversions: "As conversões" }[mainKey];
  const fmt = (n: number) => (mainKey === "revenue" ? brl(n) : int(n));
  if (previous) {
    const v = variation(current[mainKey], previous[mainKey]);
    if (v !== null && Math.abs(v) >= 3)
      out.push(`${mainLabel} ${v > 0 ? "subiram" : "caíram"} ${pct(Math.abs(v))} em relação ao período anterior (${fmt(current[mainKey])} contra ${fmt(previous[mainKey])}).`);
    else if (v !== null) out.push(`${mainLabel} ficaram estáveis em relação ao período anterior (${fmt(current[mainKey])}).`);
    const cpaNow = metricValue("cpa", current);
    const cpaBefore = metricValue("cpa", previous);
    const cv = variation(cpaNow, cpaBefore);
    if (input.objective !== "awareness" && cv !== null && Math.abs(cv) >= 5 && cpaNow !== null)
      out.push(`O custo por conversão ${cv < 0 ? "caiu" : "subiu"} ${pct(Math.abs(cv))}, para ${brl(cpaNow)}.`);
  }
  const meta = input.byPlatform.meta?.current;
  const google = input.byPlatform.google?.current;
  if (meta && google && current.spend > 0) {
    const sMeta = (meta.spend / current.spend) * 100;
    const cMeta = current.conversions > 0 ? (meta.conversions / current.conversions) * 100 : null;
    out.push(`A Meta concentrou ${pct(sMeta)} do investimento${cMeta !== null ? ` e ${pct(cMeta)} das conversões` : ""}; o Google, ${pct(100 - sMeta)}${cMeta !== null ? ` e ${pct(100 - cMeta)}` : ""}.`);
  }
  const attention = attentionPoint(input);
  return [...out.slice(0, attention ? 3 : 4), ...(attention ? [attention] : [])];
}

function attentionPoint(input: HighlightInput): string | null {
  const current = input.total.current;
  const waste = input.campaigns.filter((c) => c.conversions === 0 && current.spend > 0 && c.spend / current.spend >= 0.1).sort((a, b) => b.spend - a.spend)[0];
  const offGoal = input.goals.find((g) => g.status === "bad");
  if (input.objective !== "awareness" && input.objective !== "traffic" && waste) return `Ponto de atenção: “${waste.name}” investiu ${brl(waste.spend)} sem conversões registradas no período.`;
  if (offGoal) return `Ponto de atenção: ${lower(offGoal.label)} fora da meta — ${offGoal.text}`;
  if (input.pacing && input.pacing.status !== "ok") return `Ponto de atenção: ${input.pacing.text}`;
  return null;
}
const lower = (s: string) => (s === s.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** A first draft of the manager's analysis, written from the highlights, for the manager to review. */
export function draftAnalysis(highlights: string[], goals: GoalRow[], pacing: Pacing | null): string {
  const parts = [...highlights];
  const ok = goals.filter((g) => g.status === "ok").map((g) => lower(g.label));
  if (ok.length) parts.push(`Dentro da meta: ${ok.join(", ")}.`);
  if (pacing && !highlights.some((h) => h.includes(pacing.text))) parts.push(pacing.text);
  return parts.join(" ");
}

export const GLOSSARY: Array<[string, string]> = [
  ["Investimento", "Valor gasto em mídia nas plataformas, sem impostos (veja a linha “com impostos” quando houver)."],
  ["Impressões", "Quantas vezes os anúncios apareceram, contando repetições para a mesma pessoa."],
  ["Alcance", "Quantas pessoas diferentes viram os anúncios (só Meta)."],
  ["Frequência", "Média de vezes que cada pessoa viu os anúncios (impressões ÷ alcance)."],
  ["CTR", "Taxa de cliques: a cada 100 impressões, quantas viraram clique."],
  ["CPC", "Custo médio de cada clique."],
  ["CPM", "Custo para exibir os anúncios mil vezes."],
  ["Conversões", "Ações valiosas registradas pelas plataformas: leads, conversas iniciadas, compras e outras configuradas."],
  ["Custo por conversão (CPA)", "Investimento dividido pelo número de conversões."],
  ["ROAS", "Receita atribuída dividida pelo investimento. 3,00x = R$ 3 de receita para cada R$ 1 investido."],
];

export const ATTRIBUTION_NOTE =
  "Cada plataforma mede resultados com a própria janela de atribuição (Meta: até 7 dias após o clique e 1 dia após a visualização; Google: conforme configuração das conversões). Uma mesma venda ou lead pode ser contado pelas duas, e os números podem diferir do CRM ou do caixa. Os dados podem ser ajustados pelas plataformas por alguns dias.";

/** Selected metrics with the objective's main metrics first. */
export function orderedMetrics(selected: string[], objective: Objective): MetricKey[] {
  const valid = selected.filter((m): m is MetricKey => isKey(m));
  const primary = OBJECTIVES[objective].primary.filter((m) => valid.includes(m));
  return [...primary, ...valid.filter((m) => !primary.includes(m))];
}
const METRIC_KEYS: MetricKey[] = ["spend", "revenue", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cpa", "roas", "leads", "reach", "frequency"];
const isKey = (m: string): m is MetricKey => (METRIC_KEYS as string[]).includes(m);

export const STATUS_COLORS: Record<Status, { fg: string; bg: string; label: string }> = {
  ok: { fg: "#087a48", bg: "#e6f8ee", label: "Dentro da meta" },
  warn: { fg: "#a45b00", bg: "#fff4e0", label: "Atenção" },
  bad: { fg: "#b91c1c", bg: "#fdecec", label: "Fora da meta" },
};

/** Detail levels: how much a report shows, from a small client to a large one. */
export type DetailLevel = "essential" | "standard" | "complete";
export const DETAIL_LEVELS: Record<DetailLevel, { label: string; description: string; sections: SectionKey[]; extraMetrics: number }> = {
  essential: {
    label: "Essencial",
    description: "Para clientes menores: resumo, principais números, metas e análise.",
    sections: ["highlights", "goals", "analysis", "platforms", "glossary"],
    extraMetrics: 0,
  },
  standard: {
    label: "Padrão",
    description: "Adiciona evolução diária, funil, conversões por tipo e campanhas.",
    sections: ["highlights", "goals", "analysis", "daily", "funnel", "conversions", "platforms", "campaigns", "glossary"],
    extraMetrics: 3,
  },
  complete: {
    label: "Completo",
    description: "Tudo: criativos, pesquisas do Google, público e histórico de 6 meses.",
    sections: ALL_SECTIONS,
    extraMetrics: 99,
  },
};

const OBJECTIVE_EXTRAS: Record<Objective, MetricKey[]> = {
  leads: ["impressions", "clicks", "cpc", "leads", "cpm", "reach", "frequency"],
  sales: ["impressions", "clicks", "cpc", "spend", "cpm", "reach", "frequency"],
  traffic: ["impressions", "cpm", "conversions", "cpa", "reach", "frequency"],
  awareness: ["spend", "clicks", "ctr", "cpc", "conversions"],
};

/** Metrics for an objective at a detail level: the objective's main ones plus as many extras as the level allows. */
export function metricsFor(objective: Objective, level: DetailLevel): MetricKey[] {
  const base = OBJECTIVES[objective].primary;
  const extras = OBJECTIVE_EXTRAS[objective].filter((m) => !base.includes(m)).slice(0, DETAIL_LEVELS[level].extraMetrics);
  return [...base, ...extras];
}

/** The level whose sections match exactly, or null when the agency customised them. */
export function detectLevel(sections: string[]): DetailLevel | null {
  for (const [k, v] of Object.entries(DETAIL_LEVELS) as Array<[DetailLevel, (typeof DETAIL_LEVELS)[DetailLevel]]>) {
    if (v.sections.length === sections.length && v.sections.every((s) => sections.includes(s))) return k;
  }
  return null;
}
