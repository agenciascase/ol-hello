import { useQuery } from "@tanstack/react-query";
import { PERIOD_LABELS, type ReportPeriod } from "@/lib/report-schedule";
import { METRIC_LABELS, formatDateBR, formatMetric, formatVariation, isMetricKey, isPositiveChange, metricValue, variation, type MetricKey, type ReportTotals } from "@/lib/report-metrics";
import "../performance.css";
import "../reports.css";

type Campaign = ReportTotals & { name: string; platform: "meta" | "google"; account: string };
type PanelData = {
  clientName: string;
  logoUrl: string | null;
  reportName: string;
  intro: string | null;
  metrics: string[];
  period: string;
  range: { since: string; until: string; prevSince: string; prevUntil: string };
  compare: boolean;
  total: { current: ReportTotals; previous: ReportTotals | null };
  byPlatform: Record<string, { current: ReportTotals; previous: ReportTotals | null }>;
  campaigns: Campaign[];
  generatedAt: string;
  partial: boolean;
};
const PLATFORM = { meta: "Meta Ads", google: "Google Ads" } as const;

function Delta({ k, cur, prev }: { k: MetricKey; cur: number | null; prev: number | null }) {
  const v = variation(cur, prev);
  if (v === null) return <span className="rpDelta flat">sem comparação</span>;
  const good = isPositiveChange(k, v);
  return <span className={"rpDelta " + (good === null ? "flat" : good ? "up" : "down")}>{formatVariation(v)} vs. anterior</span>;
}

/** Public, read-only panel of a scheduled report configuration. */
export function ReportPanel({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["scase-report-panel", token],
    queryFn: async () => {
      const r = await fetch("/api/report-live?token=" + encodeURIComponent(token), { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Link indisponível");
      return body as PanelData;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const d = q.data;
  const metrics = (d?.metrics ?? []).filter(isMetricKey);
  const platforms = Object.keys(d?.byPlatform ?? {}) as Array<keyof typeof PLATFORM>;

  return (
    <main className="perf appShell themeLight" style={{ minHeight: "100vh", display: "block", background: "#f1f6f3" }}>
      <header style={{ background: "#071b14", padding: "18px clamp(16px,4vw,60px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <img src="/scase-logo-light.svg" alt="SCASE" style={{ width: 160, maxHeight: 55, objectFit: "contain" }} />
        {d?.logoUrl ? <img src={d.logoUrl} alt={d.clientName} style={{ maxWidth: 140, maxHeight: 48, objectFit: "contain", background: "white", borderRadius: 8, padding: 6 }} /> : <span style={{ color: "#e6fff1", fontSize: 13 }}>SCASE Performance · Painel do cliente</span>}
      </header>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "30px clamp(14px,3vw,42px)" }}>
        {q.isLoading ? (
          <section className="panel" style={{ padding: 30 }}>Consultando os dados das campanhas…</section>
        ) : q.isError || !d ? (
          <section className="panel" style={{ padding: 30 }}>
            <h2>Relatório indisponível</h2>
            <p>{q.error instanceof Error ? q.error.message : "Não foi possível carregar os dados."}</p>
          </section>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <span className="eyebrow">RELATÓRIO DE PERFORMANCE · {platforms.map((p) => PLATFORM[p]).join(" + ").toUpperCase()}</span>
              <h1 style={{ fontSize: "clamp(25px,3vw,39px)", fontWeight: 800, margin: "8px 0" }}>{d.clientName}</h1>
              <p style={{ opacity: 0.75 }}>
                {d.reportName} · {PERIOD_LABELS[d.period as ReportPeriod] ?? "Período"}: {formatDateBR(d.range.since)} a {formatDateBR(d.range.until)}
                {d.compare ? ` · comparado a ${formatDateBR(d.range.prevSince)} a ${formatDateBR(d.range.prevUntil)}` : ""}
              </p>
              {d.intro && <p style={{ marginTop: 14, maxWidth: 820, whiteSpace: "pre-line" }}>{d.intro}</p>}
              {d.partial && <p style={{ marginTop: 10, color: "#a45b00", fontSize: 12 }}>Alguns dados não puderam ser atualizados agora. Os números abaixo podem estar incompletos.</p>}
            </div>

            <div className="rpKpis">
              {metrics.map((k) => {
                const cur = metricValue(k, d.total.current);
                const prev = d.total.previous ? metricValue(k, d.total.previous) : null;
                return (
                  <div key={k} className="kpi">
                    <div className="kpiTop">{METRIC_LABELS[k]}</div>
                    <strong>{formatMetric(k, cur)}</strong>
                    {d.compare && <Delta k={k} cur={cur} prev={prev} />}
                  </div>
                );
              })}
            </div>

            {platforms.length > 1 && (
              <div className="rpPlatforms">
                {platforms.map((p) => {
                  const t = d.byPlatform[p];
                  if (!t) return null;
                  return (
                    <section key={p} className="panel rpCard">
                      <h2>
                        <span className={"network " + p}>{PLATFORM[p]}</span>
                      </h2>
                      {metrics
                        .filter((k) => !(p === "google" && (k === "reach" || k === "frequency" || k === "leads")))
                        .map((k) => (
                          <div key={k} className="rpRow">
                            <span>{METRIC_LABELS[k]}</span>
                            <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                              <strong>{formatMetric(k, metricValue(k, t.current))}</strong>
                              {d.compare && t.previous && <Delta k={k} cur={metricValue(k, t.current)} prev={metricValue(k, t.previous)} />}
                            </span>
                          </div>
                        ))}
                    </section>
                  );
                })}
              </div>
            )}

            <section className="panel tablePanel">
              <div className="panelHead">
                <div>
                  <h2>Campanhas</h2>
                  <p>Ordenadas por investimento no período.</p>
                </div>
              </div>
              <div className="tableScroll">
                <table className="campaignTable">
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Plataforma</th>
                      <th>Investimento</th>
                      <th>Impressões</th>
                      <th>Cliques</th>
                      <th>CTR</th>
                      <th>Conversões</th>
                      <th>Custo/conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.campaigns.length === 0 && (
                      <tr>
                        <td colSpan={8}>Sem veiculação no período.</td>
                      </tr>
                    )}
                    {d.campaigns.map((c, i) => (
                      <tr key={c.platform + c.account + c.name + i}>
                        <td className="campaignName">{c.name}</td>
                        <td>
                          <span className={"network " + c.platform}>{c.platform === "meta" ? "Meta" : "Google"}</span>
                        </td>
                        <td>{formatMetric("spend", c.spend)}</td>
                        <td>{formatMetric("impressions", c.impressions)}</td>
                        <td>{formatMetric("clicks", c.clicks)}</td>
                        <td>{formatMetric("ctr", metricValue("ctr", c))}</td>
                        <td>{formatMetric("conversions", c.conversions)}</td>
                        <td>{formatMetric("cpa", metricValue("cpa", c))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <p style={{ marginTop: 18 }}>
              <a className="secondary" href={"/api/report-pdf?token=" + encodeURIComponent(token)} target="_blank" rel="noreferrer">
                Baixar PDF
              </a>
            </p>
          </>
        )}
        <footer style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: "#61776a" }}>
          SCASE Performance · Dados fornecidos pelas plataformas de anúncio, sujeitos às regras de atribuição de cada uma. Atualizado automaticamente a cada cinco minutos.
        </footer>
      </div>
    </main>
  );
}
