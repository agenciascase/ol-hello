import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, ImageOff } from "lucide-react";
import { PERIOD_LABELS, type ReportPeriod } from "@/lib/report-schedule";
import { METRIC_LABELS, formatDateBR, formatMetric, formatVariation, isPositiveChange, metricValue, variation, type MetricKey, type ReportTotals } from "@/lib/report-metrics";
import { ATTRIBUTION_NOTE, daysBetween, GLOSSARY, OBJECTIVES, STATUS_COLORS, orderedMetrics, type AudienceRow, type FullReport, type SectionKey } from "@/lib/report-insights";
import "../performance.css";
import "../reports.css";

/** Ad picture with a placeholder when there is none or it fails to load (e.g. an expired CDN link). */
const viaProxy = (src: string) => (/^https:\/\/[^/]*(fbcdn\.net|facebook\.com|fbsbx\.com)\//.test(src) ? "/api/ad-image?u=" + encodeURIComponent(src) : src);
function CreativeImage({ src, alt }: { src: string | null; alt: string }) {
  // Try our server first (Meta's CDN may refuse browsers from other sites), then the direct link.
  const [step, setStep] = useState(0);
  const url = src ? (step === 0 ? viaProxy(src) : src) : null;
  const failed = !url || step > 1 || (step === 1 && viaProxy(src!) === src);
  return !failed ? (
    <img key={url} src={url!} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setStep((n) => n + 1)} />
  ) : (
    <div className="rpxNoImg">
      <ImageOff size={22} />
    </div>
  );
}

export type PanelData = Omit<FullReport, "errors"> & { partial: boolean };
const PLATFORM = { meta: "Meta Ads", google: "Google Ads" } as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym}/${ym.slice(2, 4)}`;
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
const pct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0).replace(".", ",")}%`;

const NAV: Array<[SectionKey | "summary", string]> = [
  ["summary", "Resumo"],
  ["goals", "Metas"],
  ["analysis", "Análise"],
  ["daily", "Evolução"],
  ["funnel", "Funil"],
  ["campaigns", "Campanhas"],
  ["creatives", "Criativos"],
  ["search_terms", "Pesquisas"],
  ["audience", "Público"],
  ["history", "Histórico"],
  ["glossary", "Como ler"],
];

function Delta({ k, cur, prev }: { k: MetricKey; cur: number | null; prev: number | null }) {
  const v = variation(cur, prev);
  if (v === null) return null;
  const good = isPositiveChange(k, v);
  return (
    <span className={"rpDelta " + (good === null ? "flat" : good ? "up" : "down")} title="Em relação ao período anterior">
      {formatVariation(v)}
    </span>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string | undefined; children: React.ReactNode }) {
  return (
    <section id={id} className="rpxSection">
      <header className="rpxSectionHead">
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function ShareBars({ rows, unit = "do investimento" }: { rows: AudienceRow[]; unit?: string }) {
  const total = rows.reduce((s, r) => s + r.spend, 0) || 1;
  return (
    <ul className="rpxBars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="rpxBarLabel">{r.label}</span>
          <span className="rpxBarTrack" aria-hidden>
            <span style={{ width: `${Math.max(1.5, (r.spend / total) * 100)}%` }} />
          </span>
          <span className="rpxBarValue">
            {pct((r.spend / total) * 100)} {unit} · {formatMetric("conversions", r.conversions)} conv.
          </span>
        </li>
      ))}
    </ul>
  );
}

type PlatformKey = keyof typeof PLATFORM;
const CAMPAIGN_COLS: Array<[MetricKey, string]> = [
  ["spend", "Investimento"],
  ["impressions", "Impressões"],
  ["clicks", "Cliques"],
  ["ctr", "CTR"],
  ["conversions", "Conversões"],
  ["cpa", "Custo/conv."],
];

/** Campaigns grouped by platform, each group with its own subtotal; tabs narrow to one platform. */
function CampaignTables({ data, platforms }: { data: PanelData; platforms: PlatformKey[] }) {
  const withCampaigns = platforms.filter((p) => data.campaigns.some((c) => c.platform === p));
  const [tab, setTab] = useState<"all" | PlatformKey>("all");
  const shown = tab === "all" ? withCampaigns : withCampaigns.filter((p) => p === tab);
  return (
    <>
      {withCampaigns.length > 1 && (
        <div className="rpxTabs" role="tablist" aria-label="Plataforma">
          {(["all", ...withCampaigns] as Array<"all" | PlatformKey>).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "all" ? "Todas" : PLATFORM[t]}
              <span>{t === "all" ? data.campaigns.length : data.campaigns.filter((c) => c.platform === t).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rpxTableWrap">
        <table className="rpxTable">
          <thead>
            <tr>
              <th>Campanha</th>
              {CAMPAIGN_COLS.map(([k, l]) => (
                <th key={k} className="num">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          {shown.map((p) => {
            const rows = data.campaigns.filter((c) => c.platform === p);
            const total = data.byPlatform[p]?.current;
            return (
              <tbody key={p} className={"rpxGroup " + p}>
                <tr className="rpxGroupHead">
                  <th colSpan={CAMPAIGN_COLS.length + 1}>
                    {PLATFORM[p]} <span>{rows.length} campanha{rows.length === 1 ? "" : "s"}</span>
                  </th>
                </tr>
                {rows.map((c, i) => (
                  <tr key={c.account + c.name + i}>
                    <td className="name">{c.name}</td>
                    {CAMPAIGN_COLS.map(([k]) => (
                      <td key={k} className="num">
                        {formatMetric(k, metricValue(k, c))}
                      </td>
                    ))}
                  </tr>
                ))}
                {total && (
                  <tr className="rpxSubtotal">
                    <td>Total {PLATFORM[p]}</td>
                    {CAMPAIGN_COLS.map(([k]) => (
                      <td key={k} className="num">
                        {formatMetric(k, metricValue(k, total))}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            );
          })}
          {tab === "all" && shown.length > 1 && (
            <tbody>
              <tr className="rpxGrandTotal">
                <td>Total geral</td>
                {CAMPAIGN_COLS.map(([k]) => (
                  <td key={k} className="num">
                    {formatMetric(k, metricValue(k, data.total.current))}
                  </td>
                ))}
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </>
  );
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
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: false,
  });
  const d = q.data;

  if (q.isLoading || q.isError || !d)
    return (
      <main className="perf rpx">
        <div className="rpxHero rpxHeroSlim">
          <img src="/scase-logo-light.svg" alt="SCASE" className="rpxLogo" />
        </div>
        <div className="rpxWrap">
          <section className="rpxState">
            {q.isLoading ? (
              <p>Consultando os resultados das campanhas…</p>
            ) : (
              <>
                <h2>Este relatório não está disponível</h2>
                <p>{q.error instanceof Error ? q.error.message : "Não foi possível carregar os dados."} Fale com a sua equipe na SCASE para receber um link novo.</p>
              </>
            )}
          </section>
        </div>
      </main>
    );

  return <ReportView d={d} pdfHref={"/api/report-pdf?token=" + encodeURIComponent(token)} />;
}

/**
 * The report itself. Used by the client's public panel and, embedded, by the agency's
 * "Visão geral" so both show exactly the same numbers and layout.
 */
export function ReportView({ d, pdfHref, embedded = false }: { d: PanelData; pdfHref: string | null; embedded?: boolean }) {
  const has = (s: SectionKey) => d.sections.includes(s);
  const metrics = orderedMetrics(d.metrics, d.objective);
  const primary = metrics.filter((m) => OBJECTIVES[d.objective].primary.includes(m)).slice(0, 4);
  const secondary = metrics.filter((m) => !primary.includes(m));
  const platforms = Object.keys(d.byPlatform) as Array<keyof typeof PLATFORM>;
  const sectionHasData: Record<string, boolean> = {
    summary: true,
    goals: has("goals") && (d.goals.length > 0 || d.pacing !== null),
    analysis: has("analysis") && Boolean(d.analysis.notes || d.analysis.actions || d.analysis.nextSteps),
    daily: has("daily") && d.daily.some((x) => x.spend > 0),
    funnel: has("funnel") && d.funnel.impressions > 0,
    campaigns: has("campaigns") && d.campaigns.length > 0,
    creatives: has("creatives") && d.creatives.length > 0,
    search_terms: has("search_terms") && d.searchTerms.length > 0,
    audience: has("audience") && (Object.values(d.audience) as AudienceRow[][]).some((r) => r.length > 0),
    history: has("history") && d.history.some((m) => m.spend > 0),
    glossary: has("glossary"),
  };
  const kpi = (k: MetricKey, big: boolean) => {
    const cur = metricValue(k, d.total.current);
    return (
      <div key={k} className={big ? "rpxKpi rpxKpiBig" : "rpxKpi"}>
        <span className="rpxKpiLabel">{METRIC_LABELS[k]}</span>
        <strong>{formatMetric(k, cur)}</strong>
        {d.compare && d.total.previous && <Delta k={k} cur={cur} prev={metricValue(k, d.total.previous)} />}
      </div>
    );
  };

  const Root = embedded ? "div" : "main";
  return (
    <Root className={"perf rpx" + (embedded ? " rpxEmbedded" : "")}>
      <div className="rpxHero">
        <div className="rpxHeroTop">
          {embedded ? <span className="rpxEmbedTag">Prévia do que o cliente recebe</span> : <img src="/scase-logo-light.svg" alt="SCASE" className="rpxLogo" />}
          <div className="rpxHeroActions">
            {pdfHref && (
              <a className="rpxPdf" href={pdfHref} target="_blank" rel="noreferrer">
                <Download size={15} /> Baixar PDF
              </a>
            )}
          </div>
        </div>
        <div className="rpxHeroBody">
          <div className="rpxIdentity">
            <div className="rpxWho">
              <span className="rpxAvatar">{d.logoUrl ? <img src={d.logoUrl} alt="" /> : initials(d.clientName)}</span>
              <div className="rpxWhoText">
                <span className="rpxIdLabel">Cliente</span>
                <strong className="rpxClientName">{d.clientName}</strong>
                <div className="rpxBadges">
                  {platforms.map((p) => (
                    <span key={p} className={"rpxPlat " + p}>
                      <i aria-hidden />
                      {PLATFORM[p]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="rpxPeriodCard">
              <span className="rpxIdLabel">Período de análise</span>
              <strong>
                {d.range.since === d.range.until ? formatDateBR(d.range.since) : `${formatDateBR(d.range.since)} a ${formatDateBR(d.range.until)}`}
              </strong>
              <small>
                {PERIOD_LABELS[d.period as ReportPeriod] ? PERIOD_LABELS[d.period as ReportPeriod] + " · " : ""}
                {daysBetween(d.range.since, d.range.until)} dia{daysBetween(d.range.since, d.range.until) === 1 ? "" : "s"}
                {d.compare && ` · comparado a ${formatDateBR(d.range.prevSince)} a ${formatDateBR(d.range.prevUntil)}`}
              </small>
            </div>
          </div>
        </div>
      </div>

      <nav className="rpxNav" aria-label="Seções do relatório">
        <div className="rpxWrap">
          {NAV.filter(([k]) => sectionHasData[k]).map(([k, l]) => (
            <a key={k} href={"#" + k}>
              {l}
            </a>
          ))}
        </div>
      </nav>

      <div className="rpxWrap">
        {d.partial && <p className="rpxNotice">Parte dos dados não pôde ser atualizada agora. Os números abaixo podem estar incompletos; tente recarregar em alguns minutos.</p>}

        <Section id="summary" title="Resumo do período" note={d.intro ?? undefined}>
          {has("highlights") && d.highlights.length > 0 && (
            <ul className="rpxHighlights">
              {d.highlights.map((h) => (
                <li key={h} className={h.startsWith("Ponto de atenção") ? "attention" : ""}>
                  {h}
                </li>
              ))}
            </ul>
          )}
          <div className="rpxKpis">
            <div className="rpxKpiRow rpxKpiRowBig">{primary.map((k) => kpi(k, true))}</div>
            {secondary.length > 0 && <div className="rpxKpiRow">{secondary.map((k) => kpi(k, false))}</div>}
          </div>
          {d.taxes.spendWithTax !== null && (
            <p className="rpxTax">
              Investimento em mídia {formatMetric("spend", d.total.current.spend)}; com impostos <strong>{formatMetric("spend", d.taxes.spendWithTax)}</strong> (Meta {d.taxes.meta.toLocaleString("pt-BR")}%, Google {d.taxes.google.toLocaleString("pt-BR")}%). O valor com impostos é o que se aproxima da fatura.
            </p>
          )}
          {has("platforms") && platforms.length > 1 && (
            <div className="rpxPlatforms">
              {platforms.map((p) => {
                const t = d.byPlatform[p];
                if (!t) return null;
                const share = d.total.current.spend ? (t.current.spend / d.total.current.spend) * 100 : 0;
                return (
                  <div key={p} className={"rpxPlatform " + p}>
                    <div className="rpxPlatformHead">
                      <strong>{PLATFORM[p]}</strong>
                      <span>{pct(share)} do investimento</span>
                    </div>
                    <dl>
                      {(["spend", "clicks", "conversions", "cpa"] as MetricKey[]).map((k) => (
                        <div key={k}>
                          <dt>{k === "cpa" ? "Custo/conv." : METRIC_LABELS[k]}</dt>
                          <dd>
                            {formatMetric(k, metricValue(k, t.current))}
                            {d.compare && t.previous && <Delta k={k} cur={metricValue(k, t.current)} prev={metricValue(k, t.previous)} />}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {sectionHasData["goals"] && (
          <Section id="goals" title="Metas" note="Metas mensais ajustadas para o tamanho do período.">
            <div className="rpxGoals">
              {d.goals.map((g) => (
                <div key={g.key} className="rpxGoal" style={{ borderLeftColor: STATUS_COLORS[g.status].fg }}>
                  <span className="rpxStatus" style={{ color: STATUS_COLORS[g.status].fg, background: STATUS_COLORS[g.status].bg }}>
                    {STATUS_COLORS[g.status].label}
                  </span>
                  <strong>{g.label}</strong>
                  <p>{g.text}</p>
                </div>
              ))}
            </div>
            {d.pacing && (
              <div className="rpxPacing">
                <div className="rpxPacingHead">
                  <strong>Verba do mês</strong>
                  <span>
                    {formatMetric("spend", d.pacing.spentMonth)} de {formatMetric("spend", d.pacing.budget)}
                  </span>
                </div>
                <div className="rpxPacingTrack" role="img" aria-label={d.pacing.text}>
                  <span style={{ width: `${Math.min(100, (d.pacing.spentMonth / d.pacing.budget) * 100)}%`, background: STATUS_COLORS[d.pacing.status].fg }} />
                  <i style={{ left: `${Math.min(100, (d.pacing.expectedToDate / d.pacing.budget) * 100)}%` }} title={`Esperado até o dia ${d.pacing.dayOfMonth}`} />
                </div>
                <p style={{ color: STATUS_COLORS[d.pacing.status].fg }}>{d.pacing.text}</p>
              </div>
            )}
          </Section>
        )}

        {sectionHasData["analysis"] && (
          <Section id="analysis" title="Análise da equipe">
            <div className="rpxAnalysis">
              {d.analysis.notes && <p className="rpxAnalysisMain">{d.analysis.notes}</p>}
              <div className="rpxAnalysisCols">
                {d.analysis.actions && (
                  <div>
                    <h3>O que fizemos no período</h3>
                    <p>{d.analysis.actions}</p>
                  </div>
                )}
                {d.analysis.nextSteps && (
                  <div>
                    <h3>Próximos passos</h3>
                    <p>{d.analysis.nextSteps}</p>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {sectionHasData["daily"] && (
          <Section id="daily" title="Evolução diária" note="Barras mostram o investimento de cada dia; a linha, as conversões.">
            <div className="rpxChart">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={d.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e3ece6" />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "#6b8073" }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis yAxisId="s" tickFormatter={(v: number) => formatMetric("spend", v).replace(",00", "")} tick={{ fontSize: 11, fill: "#6b8073" }} axisLine={false} tickLine={false} width={78} />
                  <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11, fill: "#6b8073" }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(l: string) => formatDateBR(l)}
                    formatter={(v: number, name: string) => (name === "spend" ? [formatMetric("spend", v), "Investimento"] : [formatMetric("conversions", v), "Conversões"])}
                  />
                  <Bar yAxisId="s" dataKey="spend" fill="#a8e2c4" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="c" dataKey="conversions" stroke="#0b3d2a" strokeWidth={2.2} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {(sectionHasData["funnel"] || (has("conversions") && d.conversionTypes.length > 0)) && (
          <Section id="funnel" title="Do anúncio ao resultado">
            <div className="rpxTwoCol">
              {sectionHasData["funnel"] && (
                <ol className="rpxFunnel">
                  {(
                    [
                      ["Viram o anúncio (impressões)", d.funnel.impressions],
                      ["Clicaram", d.funnel.clicks],
                      ...(d.funnel.landingPageViews ? ([["Abriram a página (Meta)", d.funnel.landingPageViews]] as Array<[string, number]>) : []),
                      ["Converteram", d.funnel.conversions],
                    ] as Array<[string, number]>
                  ).map(([label, value], i, all) => {
                    const prev = all[i - 1];
                    return (
                      <li key={label} style={{ width: `${100 - i * (45 / Math.max(1, all.length - 1))}%` }}>
                        <strong>{formatMetric("impressions", value)}</strong>
                        <span>{label}</span>
                        {prev && prev[1] > 0 && <em>{pct((value / prev[1]) * 100)} da etapa anterior</em>}
                      </li>
                    );
                  })}
                </ol>
              )}
              {has("conversions") && d.conversionTypes.length > 0 && (
                <div>
                  <h3 className="rpxSub">Conversões por tipo</h3>
                  <table className="rpxTable">
                    <tbody>
                      {d.conversionTypes.map((t) => (
                        <tr key={t.platform + t.label}>
                          <td>
                            {t.label}
                            <small className={"rpxTag " + t.platform}>{t.platform === "meta" ? "Meta" : "Google"}</small>
                          </td>
                          <td className="num">{formatMetric("conversions", t.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Section>
        )}

        {sectionHasData["campaigns"] && (
          <Section id="campaigns" title="Campanhas" note="Separadas por plataforma e ordenadas por investimento, com o total de cada uma.">
            <CampaignTables data={d} platforms={platforms} />
          </Section>
        )}

        {sectionHasData["creatives"] && (
          <Section id="creatives" title="Anúncios com maior investimento" note="Meta Ads.">
            <div className="rpxCreatives">
              {d.creatives.map((c) => (
                <figure key={c.id}>
                  <CreativeImage src={c.thumbnail} alt={c.name} />
                  <figcaption>
                    <strong title={c.name}>{c.name}</strong>
                    <span>
                      {formatMetric("spend", c.spend)} · CTR {formatMetric("ctr", c.impressions ? (c.clicks / c.impressions) * 100 : null)}
                    </span>
                    <span>
                      {formatMetric("conversions", c.conversions)} conv. · {formatMetric("cpa", c.conversions ? c.spend / c.conversions : null)} cada
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>
        )}

        {sectionHasData["search_terms"] && (
          <Section id="search_terms" title="O que as pessoas pesquisaram" note="Termos do Google que mais geraram cliques nos anúncios.">
            <div className="rpxTableWrap">
              <table className="rpxTable">
                <thead>
                  <tr>
                    <th>Pesquisa</th>
                    <th className="num">Cliques</th>
                    <th className="num">Conversões</th>
                    <th className="num">Investimento</th>
                  </tr>
                </thead>
                <tbody>
                  {d.searchTerms.map((t) => (
                    <tr key={t.term}>
                      <td className="name">{t.term}</td>
                      <td className="num">{formatMetric("clicks", t.clicks)}</td>
                      <td className="num">{formatMetric("conversions", t.conversions)}</td>
                      <td className="num">{formatMetric("spend", t.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {sectionHasData["audience"] && (
          <Section id="audience" title="Quem foi impactado" note="Divisão do investimento e das conversões.">
            <div className="rpxAudience">
              {(
                [
                  ["Idade e gênero", d.audience.ageGender, "Meta"],
                  ["Regiões", d.audience.region, "Meta"],
                  ["Dispositivos", d.audience.device, null],
                  ["Onde os anúncios apareceram", d.audience.placement, "Meta"],
                ] as Array<[string, AudienceRow[], string | null]>
              )
                .filter(([, rows]) => rows.length > 0)
                .map(([title, rows, src]) => (
                  <div key={title}>
                    <h3 className="rpxSub">
                      {title} {src && <small>{src}</small>}
                    </h3>
                    <ShareBars rows={rows.slice(0, 8)} />
                  </div>
                ))}
            </div>
          </Section>
        )}

        {sectionHasData["history"] && (
          <Section id="history" title="Últimos 6 meses" note="O mês atual ainda está em andamento.">
            <div className="rpxChart">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={d.history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e3ece6" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 12, fill: "#3d5546" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="s" tickFormatter={(v: number) => formatMetric("spend", v).replace(",00", "")} tick={{ fontSize: 11, fill: "#6b8073" }} axisLine={false} tickLine={false} width={86} />
                  <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11, fill: "#6b8073" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(l: string) => monthLabel(l)}
                    formatter={(v: number, name: string) => (name === "spend" ? [formatMetric("spend", v), "Investimento"] : [formatMetric("conversions", v), "Conversões"])}
                  />
                  <Bar yAxisId="s" dataKey="spend" fill="#16a861" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  <Line yAxisId="c" dataKey="conversions" stroke="#0b3d2a" strokeWidth={2.2} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {sectionHasData["glossary"] && (
          <Section id="glossary" title="Como ler este relatório">
            <details className="rpxGlossary">
              <summary>O que significa cada indicador</summary>
              <dl>
                {GLOSSARY.map(([t, def]) => (
                  <div key={t}>
                    <dt>{t}</dt>
                    <dd>{def}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <p className="rpxAttribution">{ATTRIBUTION_NOTE}</p>
          </Section>
        )}

        <footer className="rpxFoot">
          Relatório preparado pela SCASE com dados da Meta e do Google. Atualizado em {new Date(d.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.
        </footer>
      </div>
    </Root>
  );
}
