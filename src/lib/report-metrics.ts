// Pure metric helpers shared by the live panel, the PDF and the e-mail (no Node or browser APIs).
export type MetricKey =
  | "spend"
  | "revenue"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions"
  | "cpa"
  | "roas"
  | "leads"
  | "reach"
  | "frequency";

export type ReportTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  leads: number | null;
  reach: number | null;
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Investimento",
  revenue: "Receita atribuída",
  impressions: "Impressões",
  clicks: "Cliques",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  conversions: "Conversões",
  cpa: "Custo por conversão",
  roas: "ROAS",
  leads: "Leads",
  reach: "Alcance",
  frequency: "Frequência",
};

/** Metrics where a lower value is better (used to colour the variation). */
export const LOWER_IS_BETTER: ReadonlySet<MetricKey> = new Set<MetricKey>(["cpc", "cpm", "cpa"]);

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function metricValue(key: MetricKey, t: ReportTotals): number | null {
  switch (key) {
    case "spend":
      return t.spend;
    case "revenue":
      return t.revenue;
    case "impressions":
      return t.impressions;
    case "clicks":
      return t.clicks;
    case "conversions":
      return t.conversions;
    case "leads":
      return t.leads;
    case "reach":
      return t.reach;
    case "ctr":
      return div(t.clicks * 100, t.impressions);
    case "cpc":
      return div(t.spend, t.clicks);
    case "cpm":
      return div(t.spend * 1000, t.impressions);
    case "cpa":
      return div(t.spend, t.conversions);
    case "roas":
      return div(t.revenue, t.spend);
    case "frequency":
      return t.reach === null ? null : div(t.impressions, t.reach);
  }
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (key === "spend" || key === "revenue" || key === "cpc" || key === "cpm" || key === "cpa") return brl.format(value);
  if (key === "ctr") return dec.format(value) + "%";
  if (key === "roas") return dec.format(value) + "x";
  if (key === "frequency") return dec.format(value);
  if (key === "conversions") return value % 1 === 0 ? int.format(value) : dec.format(value);
  return int.format(value);
}

/** Percent change from previous to current, or null when there is nothing to compare. */
export function variation(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatVariation(v: number | null): string {
  if (v === null) return "";
  return (v > 0 ? "+" : "") + dec.format(v) + "%";
}

/** True when the change is good news for the client. */
export function isPositiveChange(key: MetricKey, v: number | null): boolean | null {
  if (v === null || v === 0) return null;
  return LOWER_IS_BETTER.has(key) ? v < 0 : v > 0;
}

export function isMetricKey(value: string): value is MetricKey {
  return value in METRIC_LABELS;
}

export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
