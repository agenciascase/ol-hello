/**
 * Server-only: short period analysis written in a traffic manager's voice from the report numbers.
 * Uses the Lovable AI gateway (LOVABLE_API_KEY, provisioned by Lovable Cloud) or the Anthropic API
 * (ANTHROPIC_API_KEY). Without either, falls back to a plain-language text built from the numbers.
 */
import { formatMetric, metricValue, variation, type MetricKey, type ReportTotals } from "./report-metrics";
import { OBJECTIVES, draftAnalysis, type FullReport } from "./report-insights";

const KEYS: MetricKey[] = ["spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "conversions", "cpa", "leads", "revenue", "roas"];
const LABEL: Partial<Record<MetricKey, string>> = {
  spend: "investimento", impressions: "impressões", reach: "alcance", frequency: "frequência", clicks: "cliques", ctr: "CTR", cpc: "CPC",
  cpm: "CPM", conversions: "conversões", cpa: "custo por conversão", leads: "leads", revenue: "receita", roas: "ROAS",
};

function numbers(t: ReportTotals, prev: ReportTotals | null) {
  return KEYS.map((k) => {
    const v = metricValue(k, t);
    if (v === null || (v === 0 && ["revenue", "roas", "reach", "frequency", "leads"].includes(k))) return null;
    const p = prev ? metricValue(k, prev) : null;
    const d = variation(v, p);
    return `- ${LABEL[k]}: ${formatMetric(k, v)}${d !== null ? ` (período anterior: ${formatMetric(k, p)}; variação ${d > 0 ? "+" : ""}${d.toFixed(0)}%)` : ""}`;
  })
    .filter(Boolean)
    .join("\n");
}

/** Compact, factual brief of the report for the writer. */
export function analysisBrief(r: FullReport) {
  const platforms = Object.keys(r.byPlatform).map((p) => (p === "meta" ? "Meta Ads" : "Google Ads")).join(" e ");
  const top = r.campaigns
    .slice()
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((c) => `- ${c.name} (${c.platform === "meta" ? "Meta" : "Google"}): investimento ${formatMetric("spend", c.spend)}, ${formatMetric("conversions", c.conversions)} conversões, CTR ${formatMetric("ctr", metricValue("ctr", c))}${c.conversions ? `, custo por conversão ${formatMetric("cpa", c.spend / c.conversions)}` : ""}`)
    .join("\n");
  const goals = r.goals.map((g) => `- ${g.text}`).join("\n");
  return [
    `Cliente: ${r.clientName}`,
    `Objetivo: ${OBJECTIVES[r.objective].label}`,
    `Plataformas: ${platforms || "—"}`,
    `Período: ${r.range.since.split("-").reverse().join("/")} a ${r.range.until.split("-").reverse().join("/")}${r.compare ? ` (comparado a ${r.range.prevSince.split("-").reverse().join("/")} a ${r.range.prevUntil.split("-").reverse().join("/")})` : ""}`,
    `Campanhas: ${r.campaignFilter ?? "todas"}`,
    "",
    "Números do período:",
    numbers(r.total.current, r.compare ? r.total.previous : null),
    top ? `\nCampanhas com maior investimento:\n${top}` : "",
    goals ? `\nMetas do cliente:\n${goals}` : "",
    r.pacing ? `\nRitmo da verba: ${r.pacing.text}` : "",
  ].join("\n");
}

const SYSTEM = `Você é gestor de tráfego pago de uma agência e escreve a análise do período que vai no relatório do cliente.
Escreva em português do Brasil, em primeira pessoa do plural ("tivemos", "vamos"), como um profissional experiente falando com o dono do negócio.
Regras:
- Use apenas os números fornecidos. Não invente dados, metas, causas ou ações que já teriam sido feitas.
- Linguagem do dia a dia: troque siglas por palavras simples quando possível (ex.: "custo por contato" em vez de CPA); se usar CTR ou CPM, explique em poucas palavras.
- Seja objetivo e profissional. Destaque primeiro o resultado principal do objetivo, depois um ponto de atenção (se houver) já com o próximo passo.
- Quando algum número piorar, contextualize com calma e diga o que vamos fazer; nunca culpe o cliente nem a plataforma, nunca deixe dúvida em aberto.
- Não prometa resultados futuros, não use exageros, emojis, listas, títulos nem markdown.
- Nunca mencione inteligência artificial, modelo, dados fornecidos ou "análise automática".
- Tamanho: um parágrafo de 3 a 5 frases, entre 60 e 110 palavras.`;

async function viaLovable(brief: string, key: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: brief }] }),
  });
  if (res.status === 402) throw new Error("Sem créditos de IA no Lovable para gerar a análise.");
  if (res.status === 429) throw new Error("Muitas análises seguidas. Tente de novo em instantes.");
  if (!res.ok) throw new Error("Serviço de IA indisponível (" + res.status + ").");
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}

async function viaAnthropic(brief: string, key: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-4-5", max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: brief }] }),
  });
  if (!res.ok) throw new Error("Serviço de IA indisponível (" + res.status + ").");
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (body.content ?? []).map((c) => c.text ?? "").join("");
}

/** Returns the analysis text and where it came from ("ia" or "numeros"). */
export async function writeAnalysis(r: FullReport): Promise<{ text: string; source: "ia" | "numeros"; note?: string | undefined }> {
  const brief = analysisBrief(r);
  const fallback = () => draftAnalysis(r.highlights, r.goals, r.pacing);
  const lovable = process.env["LOVABLE_API_KEY"];
  const anthropic = process.env["ANTHROPIC_API_KEY"];
  if (!lovable && !anthropic) return { text: fallback(), source: "numeros", note: "IA não configurada; texto montado a partir dos números." };
  try {
    const raw = lovable ? await viaLovable(brief, lovable) : await viaAnthropic(brief, anthropic!);
    const text = raw.replace(/[*#_`]/g, "").replace(/\s+\n/g, "\n").trim();
    return text ? { text, source: "ia" } : { text: fallback(), source: "numeros" };
  } catch (e) {
    return { text: fallback(), source: "numeros", note: e instanceof Error ? e.message : undefined };
  }
}
