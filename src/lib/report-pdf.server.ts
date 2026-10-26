/**
 * Server-side PDF for scheduled reports. Dependency-free: writes a plain PDF 1.4 with the
 * built-in Helvetica fonts (WinAnsi encoding, so Portuguese accents render correctly).
 * Layout: summary first (highlights, KPIs, goals, analysis), details after, glossary at the end.
 */
import type { FullReport } from "./report-insights";
import { ATTRIBUTION_NOTE, GLOSSARY, OBJECTIVES, STATUS_COLORS, orderedMetrics, type SectionKey, type Status } from "./report-insights";
import { PERIOD_LABELS, type ReportPeriod } from "./report-schedule";
import { METRIC_LABELS, formatDateBR, formatMetric, formatVariation, isPositiveChange, metricValue, variation, type MetricKey } from "./report-metrics";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const C = {
  ink: hex("#102f1d"),
  body: hex("#3d5546"),
  muted: hex("#6b8073"),
  band: hex("#082d20"),
  band2: hex("#0d3b2a"),
  signal: hex("#07e77e"),
  white: hex("#ffffff"),
  card: hex("#f4faf6"),
  soft: hex("#e6f8ee"),
  border: hex("#d7e9de"),
  good: hex("#087a48"),
  bad: hex("#b91c1c"),
  warn: hex("#a45b00"),
  bar: hex("#0fb866"),
  bar2: hex("#9fdcbc"),
  line: hex("#102f1d"),
  meta: hex("#7055c7"),
  google: hex("#3067bf"),
};
const statusRGB = (s: Status) => ({ fg: hex(STATUS_COLORS[s].fg), bg: hex(STATUS_COLORS[s].bg) });

// Characters outside Latin-1 that exist in WinAnsi (cp1252).
const CP1252: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "™": 0x99 };
function pdfString(text: string) {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 63;
    let byte = CP1252[ch] ?? (code < 256 ? code : 63);
    if (byte < 32) byte = 32;
    const c = String.fromCharCode(byte);
    out += c === "(" || c === ")" || c === "\\" ? "\\" + c : c;
  }
  return "(" + out + ")";
}
/** Rough Helvetica width, good enough for truncation, wrapping and right alignment. */
const textWidth = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.56 : 0.51);
function fit(text: string, size: number, maxWidth: number, bold = false) {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidth(t + "…", size, bold) > maxWidth) t = t.slice(0, -1);
  return t + "…";
}
function wrap(text: string, size: number, maxWidth: number, bold = false) {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (textWidth(next, size, bold) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}
const rgb = (c: RGB) => c.map((n) => n.toFixed(3)).join(" ");

class PdfDoc {
  readonly W = 595;
  readonly H = 842;
  readonly M = 40;
  private pages: string[] = [];
  private ops: string[] = [];
  y = 0;
  constructor(private footer: string) {
    this.newPage();
  }
  get contentW() {
    return this.W - this.M * 2;
  }
  newPage() {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    this.y = this.H - 44;
  }
  rect(x: number, yTop: number, w: number, h: number, fill: RGB, stroke?: RGB) {
    this.ops.push(`${rgb(fill)} rg`);
    if (stroke) this.ops.push(`${rgb(stroke)} RG 0.7 w`);
    this.ops.push(`${x.toFixed(1)} ${(yTop - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re ${stroke ? "B" : "f"}`);
  }
  line(x1: number, y1: number, x2: number, y2: number, color: RGB, width = 0.6) {
    this.ops.push(`${rgb(color)} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  }
  polyline(points: Array<[number, number]>, color: RGB, width = 1.4) {
    if (points.length < 2) return;
    const [first, ...rest] = points;
    this.ops.push(`${rgb(color)} RG ${width} w 1 J 1 j ${first![0].toFixed(1)} ${first![1].toFixed(1)} m ${rest.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)} l`).join(" ")} S`);
  }
  text(x: number, y: number, text: string, size: number, opts: { bold?: boolean; color?: RGB; align?: "left" | "right" | "center" } = {}) {
    const w = textWidth(text, size, opts.bold);
    const tx = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${rgb(opts.color ?? C.ink)} rg ${tx.toFixed(1)} ${y.toFixed(1)} Td ${pdfString(text)} Tj ET`);
  }
  /** Opens a new page when the next block would not fit. */
  ensure(height: number) {
    if (this.y - height < 56) this.newPage();
  }
  toBytes(): Uint8Array {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    const total = this.pages.length;
    const objects: string[] = [];
    const pageIds: number[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    let id = 5;
    this.pages.forEach((body, i) => {
      const foot = `${rgb(C.border)} RG 0.6 w ${this.M} 40 m ${this.W - this.M} 40 l S BT /F1 7.5 Tf ${rgb(C.muted)} rg ${this.M} 28 Td ${pdfString(this.footer)} Tj ET BT /F1 7.5 Tf ${rgb(C.muted)} rg ${this.W - this.M - 30} 28 Td ${pdfString(`${i + 1} / ${total}`)} Tj ET`;
      const content = body + "\n" + foot;
      const pageId = id++;
      const contentId = id++;
      pageIds.push(pageId);
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => p + " 0 R").join(" ")}] /Count ${pageIds.length} >>`;
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets: number[] = [];
    for (let i = 1; i < objects.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    // Every character is a single byte (0-255), so latin1 keeps the offsets exact.
    return Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 0xff);
  }
}

type Col = { label: string; x: number; align?: "left" | "right"; width?: number };

const PLATFORM_LABEL = { meta: "Meta Ads", google: "Google Ads" } as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym}/${ym.slice(2, 4)}`;
const short = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(".", ",") + " mi" : n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + " mil" : String(Math.round(n)));

export function renderReportPdf(report: FullReport, panelUrl: string | null): Uint8Array {
  const generated = new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const doc = new PdfDoc(`SCASE Performance · ${report.clientName} · gerado em ${generated}`);
  const M = doc.M;
  const W = doc.contentW;
  const has = (s: SectionKey) => report.sections.includes(s);
  const metrics = orderedMetrics(report.metrics, report.objective);
  const periodLabel = PERIOD_LABELS[report.period as ReportPeriod] ?? "Período";

  const section = (title: string, subtitle?: string, need = 70) => {
    doc.ensure(need);
    doc.y -= 6;
    doc.rect(M, doc.y + 2, 3, 15, C.signal);
    doc.text(M + 10, doc.y - 10, title, 13, { bold: true });
    doc.y -= 18;
    if (subtitle) {
      doc.text(M + 10, doc.y - 3, subtitle, 8.5, { color: C.muted });
      doc.y -= 12;
    }
    doc.y -= 8;
  };
  const paragraph = (text: string, size = 10, color = C.body, indent = 0) => {
    for (const line of wrap(text, size, W - indent)) {
      doc.ensure(size + 6);
      doc.text(M + indent, doc.y - size, line, size, { color });
      doc.y -= size + 4.5;
    }
  };
  const table = (cols: Col[], rows: string[][], opts: { boldFirst?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 9;
    const header = () => {
      doc.rect(M, doc.y, W, 18, C.card);
      for (const c of cols) doc.text(c.align === "right" ? c.x : c.x, doc.y - 12, c.label, 7.5, { bold: true, color: C.muted, align: c.align ?? "left" });
      doc.y -= 18;
    };
    doc.ensure(40);
    header();
    rows.forEach((r, i) => {
      if (doc.y - 16 < 56) {
        doc.newPage();
        header();
      }
      cols.forEach((c, j) => {
        const v = c.width ? fit(r[j] ?? "", size, c.width, opts.boldFirst && j === 0) : r[j] ?? "";
        doc.text(c.x, doc.y - 11, v, size, { align: c.align ?? "left", bold: Boolean(opts.boldFirst && j === 0), color: j === 0 ? C.ink : C.body });
      });
      doc.y -= 16;
      if (i < rows.length - 1) doc.line(M, doc.y + 2, M + W, doc.y + 2, C.border, 0.4);
    });
    doc.y -= 10;
  };

  /* Header band */
  doc.rect(0, doc.H, doc.W, 128, C.band);
  doc.rect(0, doc.H - 124, doc.W, 4, C.signal);
  doc.text(M, doc.H - 34, "SCASE PERFORMANCE · RELATÓRIO DE RESULTADOS", 8.5, { bold: true, color: C.signal });
  doc.text(M, doc.H - 62, fit(report.clientName, 22, W, true), 22, { bold: true, color: C.white });
  doc.text(M, doc.H - 82, fit(`${report.reportName} · ${OBJECTIVES[report.objective].label}`, 11, W), 11, { color: C.white });
  doc.text(
    M,
    doc.H - 101,
    `${periodLabel}: ${formatDateBR(report.range.since)} a ${formatDateBR(report.range.until)}` + (report.compare ? `   ·   comparação: ${formatDateBR(report.range.prevSince)} a ${formatDateBR(report.range.prevUntil)}` : ""),
    8.5,
    { color: hex("#cfe9da") },
  );
  doc.y = doc.H - 150;

  if (report.intro) {
    paragraph(report.intro, 10.5, C.ink);
    doc.y -= 8;
  }
  for (const e of report.errors) {
    doc.ensure(14);
    doc.text(M, doc.y - 9, fit("Atenção: " + e, 8.5, W), 8.5, { color: C.bad });
    doc.y -= 13;
  }

  /* Highlights */
  if (has("highlights") && report.highlights.length) {
    const lines = report.highlights.map((h) => wrap(h, 9.5, W - 40));
    const h = 26 + lines.reduce((s, l) => s + l.length * 13.5 + 4, 0);
    doc.ensure(h + 10);
    doc.rect(M, doc.y, W, h, C.soft);
    doc.rect(M, doc.y, 3, h, C.good);
    doc.text(M + 16, doc.y - 17, "RESUMO DO PERÍODO", 8, { bold: true, color: C.good });
    let yy = doc.y - 33;
    for (const l of lines) {
      doc.rect(M + 17, yy + 7, 4, 4, C.good);
      for (const line of l) {
        doc.text(M + 28, yy, line, 9.5, { color: C.ink });
        yy -= 13.5;
      }
      yy -= 4;
    }
    doc.y -= h + 16;
  }

  /* KPI cards */
  if (metrics.length) {
    section("Indicadores principais", report.compare ? "Variação em relação ao período anterior" : undefined, 110);
    const cols = 4;
    const gap = 8;
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = 60;
    metrics.slice(0, 12).forEach((key, i) => {
      if (i % cols === 0) {
        if (i > 0) doc.y -= ch + gap;
        doc.ensure(ch);
      }
      const x = M + (i % cols) * (cw + gap);
      const top = doc.y;
      const cur = metricValue(key, report.total.current);
      const prev = report.total.previous ? metricValue(key, report.total.previous) : null;
      const v = variation(cur, prev);
      const good = isPositiveChange(key, v);
      const primary = i < OBJECTIVES[report.objective].primary.length && OBJECTIVES[report.objective].primary.includes(key);
      doc.rect(x, top, cw, ch, primary ? C.soft : C.card, C.border);
      doc.text(x + 10, top - 16, fit(METRIC_LABELS[key], 8, cw - 20), 8, { color: C.muted });
      doc.text(x + 10, top - 37, fit(formatMetric(key, cur), 15, cw - 20, true), 15, { bold: true });
      if (report.compare && v !== null) doc.text(x + 10, top - 51, formatVariation(v), 8, { bold: true, color: good === null ? C.muted : good ? C.good : C.bad });
    });
    doc.y -= ch + 12;
    if (report.taxes.spendWithTax !== null) {
      doc.text(M, doc.y - 9, `Investimento em mídia: ${formatMetric("spend", report.total.current.spend)}   ·   com impostos: ${formatMetric("spend", report.taxes.spendWithTax)}`, 9, { bold: true, color: C.body });
      doc.text(M, doc.y - 21, `Impostos considerados — Meta: ${report.taxes.meta.toLocaleString("pt-BR")}% · Google: ${report.taxes.google.toLocaleString("pt-BR")}%. O valor com impostos é o mais próximo da fatura.`, 7.5, { color: C.muted });
      doc.y -= 30;
    }
    doc.y -= 6;
  }

  /* Goals and pacing */
  if (has("goals") && (report.goals.length || report.pacing)) {
    section("Metas e ritmo da verba", undefined, 90);
    for (const g of report.goals) {
      doc.ensure(24);
      const s = statusRGB(g.status);
      const label = STATUS_COLORS[g.status].label;
      doc.rect(M, doc.y, textWidth(label, 7.5, true) + 14, 15, s.bg);
      doc.text(M + 7, doc.y - 10.5, label, 7.5, { bold: true, color: s.fg });
      doc.text(M + textWidth(label, 7.5, true) + 24, doc.y - 10.5, g.label + ":", 9, { bold: true });
      doc.text(M + textWidth(label, 7.5, true) + 30 + textWidth(g.label + ":", 9, true), doc.y - 10.5, fit(g.text, 9, W - 200), 9, { color: C.body });
      doc.y -= 22;
    }
    if (report.pacing) {
      const p = report.pacing;
      const s = statusRGB(p.status);
      doc.ensure(52);
      doc.text(M, doc.y - 10, "Ritmo da verba do mês", 9, { bold: true });
      doc.text(M + W, doc.y - 10, `${formatMetric("spend", p.spentMonth)} de ${formatMetric("spend", p.budget)}`, 9, { bold: true, align: "right" });
      doc.y -= 18;
      doc.rect(M, doc.y, W, 9, C.card, C.border);
      doc.rect(M, doc.y, Math.min(1, p.spentMonth / p.budget) * W, 9, s.fg);
      const ex = M + Math.min(1, p.expectedToDate / p.budget) * W;
      doc.line(ex, doc.y + 3, ex, doc.y - 12, C.ink, 1);
      doc.y -= 22;
      for (const l of wrap(p.text + ` A linha preta marca o esperado até o dia ${p.dayOfMonth}.`, 8.5, W)) {
        doc.text(M, doc.y, l, 8.5, { color: s.fg });
        doc.y -= 12;
      }
      doc.y -= 4;
    }
    doc.y -= 4;
  }

  /* Analysis */
  if (has("analysis")) {
    const blocks: Array<[string, string | null]> = [
      ["Análise da equipe", report.analysis.notes],
      ["Ações realizadas no período", report.analysis.actions],
      ["Próximos passos", report.analysis.nextSteps],
    ];
    for (const [title, text] of blocks) {
      if (!text) continue;
      section(title, undefined, 60);
      paragraph(text, 10, C.ink);
      doc.y -= 8;
    }
  }

  /* Daily evolution */
  if (has("daily") && report.daily.length > 1 && report.daily.some((d) => d.spend > 0)) {
    section("Evolução diária", "Barras: investimento por dia · Linha: conversões por dia", 190);
    const h = 120;
    const top = doc.y - 6;
    const n = report.daily.length;
    const slot = W / n;
    const maxS = Math.max(...report.daily.map((d) => d.spend), 1);
    const maxC = Math.max(...report.daily.map((d) => d.conversions), 1);
    for (let g = 0; g <= 3; g++) doc.line(M, top - h + (g * h) / 3, M + W, top - h + (g * h) / 3, C.border, 0.4);
    const pts: Array<[number, number]> = [];
    report.daily.forEach((d, i) => {
      const bh = (d.spend / maxS) * (h - 8);
      doc.rect(M + i * slot + slot * 0.15, top - h + bh, slot * 0.7, bh, C.bar2);
      pts.push([M + i * slot + slot / 2, top - h + (d.conversions / maxC) * (h - 8)]);
    });
    doc.polyline(pts, C.line, 1.4);
    doc.text(M, top + 4, `máx. ${formatMetric("spend", maxS)}/dia`, 7, { color: C.muted });
    doc.text(M + W, top + 4, `máx. ${formatMetric("conversions", maxC)} conv./dia`, 7, { color: C.muted, align: "right" });
    const step = Math.max(1, Math.ceil(n / 8));
    report.daily.forEach((d, i) => {
      if (i % step === 0 || i === n - 1) doc.text(M + i * slot + slot / 2, top - h - 11, d.date.slice(8, 10) + "/" + d.date.slice(5, 7), 6.5, { color: C.muted, align: "center" });
    });
    doc.y = top - h - 26;
  }

  /* Funnel */
  if (has("funnel") && report.funnel.impressions > 0) {
    const f = report.funnel;
    const steps: Array<[string, number]> = [
      ["Impressões", f.impressions],
      ["Cliques", f.clicks],
      ...(f.landingPageViews ? ([["Visitas à página (Meta)", f.landingPageViews]] as Array<[string, number]>) : []),
      ["Conversões", f.conversions],
    ];
    section("Funil do período", "Quantas pessoas avançaram em cada etapa", 40 + steps.length * 30);
    steps.forEach(([label, value], i) => {
      const w = W * (1 - i * (0.55 / Math.max(1, steps.length - 1)));
      const x = M + (W - w) / 2;
      doc.rect(x, doc.y, w, 22, i === steps.length - 1 ? C.good : i === 0 ? C.band2 : C.bar);
      const prev = steps[i - 1];
      const rate = prev && prev[1] > 0 ? ` · ${((value / prev[1]) * 100).toFixed(value / prev[1] < 0.1 ? 2 : 1).replace(".", ",")}% da etapa anterior` : "";
      doc.text(M + W / 2, doc.y - 14.5, fit(`${label}: ${formatMetric("impressions", value)}${rate}`, 9, w - 12, true), 9, { bold: true, color: C.white, align: "center" });
      doc.y -= 28;
    });
    doc.y -= 6;
  }

  /* Conversions by type */
  if (has("conversions") && report.conversionTypes.length) {
    section("Conversões por tipo", "Separadas pela forma como cada plataforma registra o resultado");
    table(
      [
        { label: "Tipo de conversão", x: M + 8, width: 330 },
        { label: "Plataforma", x: M + 360 },
        { label: "Quantidade", x: M + W - 8, align: "right" },
      ],
      report.conversionTypes.slice(0, 12).map((t) => [t.label, PLATFORM_LABEL[t.platform], formatMetric("conversions", t.value)]),
    );
  }

  /* Platforms */
  const platforms = Object.keys(report.byPlatform) as Array<keyof typeof PLATFORM_LABEL>;
  if (has("platforms") && platforms.length > 1) {
    section("Resultado por plataforma");
    const keys: MetricKey[] = ["spend", "impressions", "clicks", "conversions", "cpa"];
    table(
      [{ label: "Plataforma", x: M + 8 }, ...keys.map((k, i) => ({ label: k === "cpa" ? "CPA" : METRIC_LABELS[k], x: M + 210 + i * 66, align: "right" as const }))],
      platforms.map((p) => {
        const t = report.byPlatform[p]!.current;
        return [PLATFORM_LABEL[p], ...keys.map((k) => formatMetric(k, metricValue(k, t)))];
      }),
      { boldFirst: true },
    );
  }

  /* Campaigns */
  if (has("campaigns") && report.campaigns.length) {
    section("Campanhas", "Ordenadas por investimento");
    table(
      [
        { label: "Campanha", x: M + 8, width: 185 },
        { label: "Plat.", x: M + 200 },
        { label: "Investimento", x: M + 300, align: "right" },
        { label: "Cliques", x: M + 350, align: "right" },
        { label: "CTR", x: M + 395, align: "right" },
        { label: "Conv.", x: M + 440, align: "right" },
        { label: "CPA", x: M + W - 4, align: "right" },
      ],
      report.campaigns.slice(0, 20).map((c) => [
        c.name,
        c.platform === "meta" ? "Meta" : "Google",
        formatMetric("spend", c.spend),
        formatMetric("clicks", c.clicks),
        formatMetric("ctr", metricValue("ctr", c)),
        formatMetric("conversions", c.conversions),
        formatMetric("cpa", metricValue("cpa", c)),
      ]),
      { size: 8.5 },
    );
  }

  /* Creatives */
  if (has("creatives") && report.creatives.length) {
    section("Anúncios com maior investimento (Meta)", "As imagens dos anúncios aparecem no painel online");
    table(
      [
        { label: "Anúncio", x: M + 8, width: 250 },
        { label: "Investimento", x: M + 340, align: "right" },
        { label: "CTR", x: M + 400, align: "right" },
        { label: "Conv.", x: M + 450, align: "right" },
        { label: "CPA", x: M + W - 4, align: "right" },
      ],
      report.creatives.map((c) => [c.name, formatMetric("spend", c.spend), formatMetric("ctr", c.impressions ? (c.clicks / c.impressions) * 100 : null), formatMetric("conversions", c.conversions), formatMetric("cpa", c.conversions ? c.spend / c.conversions : null)]),
      { size: 8.5 },
    );
  }

  /* Search terms */
  if (has("search_terms") && report.searchTerms.length) {
    section("O que as pessoas pesquisaram (Google)", "Termos que mais geraram cliques");
    table(
      [
        { label: "Termo pesquisado", x: M + 8, width: 270 },
        { label: "Cliques", x: M + 360, align: "right" },
        { label: "Conv.", x: M + 420, align: "right" },
        { label: "Investimento", x: M + W - 4, align: "right" },
      ],
      report.searchTerms.slice(0, 12).map((t) => [t.term, formatMetric("clicks", t.clicks), formatMetric("conversions", t.conversions), formatMetric("spend", t.spend)]),
      { size: 8.5 },
    );
  }

  /* Audience */
  if (has("audience")) {
    const groups: Array<[string, typeof report.audience.ageGender]> = [
      ["Idade e gênero (Meta)", report.audience.ageGender.slice(0, 8)],
      ["Regiões (Meta)", report.audience.region.slice(0, 8)],
      ["Dispositivos", report.audience.device],
      ["Onde os anúncios apareceram (Meta)", report.audience.placement],
    ];
    const any = groups.some(([, r]) => r.length);
    if (any) section("Público", "Quem viu, clicou e converteu", 90);
    for (const [title, rows] of groups) {
      if (!rows.length) continue;
      doc.ensure(50);
      doc.text(M, doc.y - 9, title, 9.5, { bold: true });
      doc.y -= 16;
      const totalSpend = rows.reduce((s, r) => s + r.spend, 0) || 1;
      for (const r of rows) {
        doc.ensure(16);
        const share = r.spend / totalSpend;
        doc.text(M + 4, doc.y - 9, fit(r.label, 8.5, 150), 8.5, { color: C.body });
        doc.rect(M + 160, doc.y - 1, 200, 8, C.card);
        doc.rect(M + 160, doc.y - 1, Math.max(1, share * 200), 8, C.bar);
        doc.text(M + 368, doc.y - 8.5, `${Math.round(share * 100)}% do invest.`, 7.5, { color: C.muted });
        doc.text(M + W - 4, doc.y - 8.5, `${formatMetric("conversions", r.conversions)} conv.`, 8, { align: "right", color: C.body });
        doc.y -= 14;
      }
      doc.y -= 8;
    }
  }

  /* History */
  if (has("history") && report.history.length && report.history.some((m) => m.spend > 0)) {
    section("Histórico dos últimos 6 meses", "Investimento (barras) e conversões por mês — o mês atual está incompleto", 170);
    const h = 95;
    const top = doc.y - 14;
    const n = report.history.length;
    const slot = W / n;
    const maxS = Math.max(...report.history.map((m) => m.spend), 1);
    report.history.forEach((m, i) => {
      const bh = (m.spend / maxS) * h;
      const x = M + i * slot + slot * 0.22;
      doc.rect(x, top - h + bh, slot * 0.56, bh, i === n - 1 ? C.bar2 : C.bar);
      doc.text(M + i * slot + slot / 2, top - h + bh + 4, formatMetric("spend", m.spend).replace(",00", ""), 7.5, { align: "center", color: C.body });
      doc.text(M + i * slot + slot / 2, top - h - 12, monthLabel(m.month), 8, { bold: true, align: "center" });
      doc.text(M + i * slot + slot / 2, top - h - 24, `${short(m.conversions)} conv.`, 7.5, { align: "center", color: C.muted });
    });
    doc.y = top - h - 36;
  }

  /* Glossary */
  if (panelUrl) {
    doc.ensure(40);
    doc.rect(M, doc.y, W, 30, C.soft);
    doc.text(M + 12, doc.y - 12, "Acompanhe os números ao vivo, com gráficos e imagens dos anúncios:", 8.5, { bold: true });
    doc.text(M + 12, doc.y - 24, fit(panelUrl, 8.5, W - 24), 8.5, { color: C.good });
    doc.y -= 42;
  }
  if (has("glossary")) {
    section("Como ler este relatório", undefined, 120);
    for (const [term, def] of GLOSSARY) {
      const lines = wrap(def, 8.5, W - 130);
      doc.ensure(lines.length * 11 + 4);
      doc.text(M, doc.y - 9, term, 8.5, { bold: true });
      lines.forEach((l, i) => doc.text(M + 130, doc.y - 9 - i * 11, l, 8.5, { color: C.body }));
      doc.y -= lines.length * 11 + 4;
    }
    doc.y -= 6;
    paragraph("Sobre atribuição: " + ATTRIBUTION_NOTE, 8, C.muted);
  }

  return doc.toBytes();
}

export function reportPdfFilename(report: FullReport) {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  return `SCASE-${slug(report.clientName)}-${report.range.since}-a-${report.range.until}.pdf`;
}
