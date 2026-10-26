/**
 * Server-side PDF for scheduled reports. Dependency-free: writes a plain PDF 1.4 with the
 * built-in Helvetica fonts (WinAnsi encoding, so Portuguese accents render correctly).
 */
import type { BuiltReport } from "./report-data.server";
import { PERIOD_LABELS, type ReportPeriod } from "./report-schedule";
import {
  METRIC_LABELS,
  formatDateBR,
  formatMetric,
  formatVariation,
  isMetricKey,
  isPositiveChange,
  metricValue,
  variation,
  type MetricKey,
} from "./report-metrics";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const C = {
  ink: hex("#102f1d"),
  muted: hex("#61776a"),
  band: hex("#082d20"),
  signal: hex("#07e77e"),
  white: hex("#ffffff"),
  card: hex("#f4faf6"),
  border: hex("#d7e9de"),
  good: hex("#087a48"),
  bad: hex("#b91c1c"),
};

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
/** Rough Helvetica width, good enough for truncation and right alignment. */
const textWidth = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.56 : 0.52);
function fit(text: string, size: number, maxWidth: number, bold = false) {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidth(t + "…", size, bold) > maxWidth) t = t.slice(0, -1);
  return t + "…";
}
function wrap(text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (textWidth(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

class PdfDoc {
  readonly W = 595;
  readonly H = 842;
  private pages: string[] = [];
  private ops: string[] = [];
  y = 0;
  constructor() {
    this.newPage();
  }
  newPage() {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    this.y = this.H - 40;
  }
  rect(x: number, yTop: number, w: number, h: number, fill: RGB, stroke?: RGB) {
    this.ops.push(`${fill.map((n) => n.toFixed(3)).join(" ")} rg`);
    if (stroke) this.ops.push(`${stroke.map((n) => n.toFixed(3)).join(" ")} RG 0.8 w`);
    this.ops.push(`${x.toFixed(1)} ${(yTop - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re ${stroke ? "B" : "f"}`);
  }
  line(x1: number, y1: number, x2: number, y2: number, color: RGB) {
    this.ops.push(`${color.map((n) => n.toFixed(3)).join(" ")} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  text(x: number, y: number, text: string, size: number, opts: { bold?: boolean; color?: RGB; align?: "left" | "right" } = {}) {
    const color = opts.color ?? C.ink;
    const tx = opts.align === "right" ? x - textWidth(text, size, opts.bold) : x;
    this.ops.push(`BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${color.map((n) => n.toFixed(3)).join(" ")} rg ${tx.toFixed(1)} ${y.toFixed(1)} Td ${pdfString(text)} Tj ET`);
  }
  /** Moves the cursor down, opening a new page when the block would not fit. */
  ensure(height: number) {
    if (this.y - height < 50) this.newPage();
  }
  toBytes(): Uint8Array {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    const objects: string[] = [];
    const pageIds: number[] = [];
    // 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    let id = 5;
    for (const content of this.pages) {
      const pageId = id++;
      const contentId = id++;
      pageIds.push(pageId);
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    }
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

const PLATFORM_LABEL = { meta: "Meta Ads", google: "Google Ads" } as const;

export function renderReportPdf(report: BuiltReport, panelUrl: string | null): Uint8Array {
  const doc = new PdfDoc();
  const M = 40;
  const contentW = doc.W - M * 2;
  const metrics = report.metrics.filter(isMetricKey) as MetricKey[];
  const periodLabel = PERIOD_LABELS[report.period as ReportPeriod] ?? "Período";

  // Header band
  doc.rect(0, doc.H, doc.W, 118, C.band);
  doc.text(M, doc.H - 34, "SCASE PERFORMANCE · RELATÓRIO DE DESEMPENHO", 9, { bold: true, color: C.signal });
  doc.text(M, doc.H - 62, fit(report.clientName, 22, contentW, true), 22, { bold: true, color: C.white });
  doc.text(M, doc.H - 84, fit(report.reportName, 12, contentW), 12, { color: C.white });
  doc.text(M, doc.H - 102, `${periodLabel}: ${formatDateBR(report.range.since)} a ${formatDateBR(report.range.until)}` + (report.compare ? `  ·  comparado a ${formatDateBR(report.range.prevSince)} a ${formatDateBR(report.range.prevUntil)}` : ""), 9, { color: C.white });
  doc.y = doc.H - 146;

  if (report.intro) {
    for (const line of wrap(report.intro, 10.5, contentW)) {
      doc.ensure(16);
      doc.text(M, doc.y, line, 10.5, { color: C.ink });
      doc.y -= 15;
    }
    doc.y -= 8;
  }

  if (report.errors.length) {
    for (const e of report.errors) {
      doc.ensure(14);
      doc.text(M, doc.y, fit("Atenção: " + e, 9, contentW), 9, { color: C.bad });
      doc.y -= 13;
    }
    doc.y -= 6;
  }

  // KPI cards
  doc.ensure(30);
  doc.text(M, doc.y, "Indicadores do período", 13, { bold: true, color: C.good });
  doc.y -= 14;
  const cols = 3;
  const gap = 10;
  const cardW = (contentW - gap * (cols - 1)) / cols;
  const cardH = 62;
  metrics.forEach((key, i) => {
    if (i % cols === 0) {
      if (i > 0) doc.y -= cardH + gap;
      doc.ensure(cardH);
    }
    const x = M + (i % cols) * (cardW + gap);
    const top = doc.y;
    const cur = metricValue(key, report.total.current);
    const prev = report.total.previous ? metricValue(key, report.total.previous) : null;
    const v = variation(cur, prev);
    const good = isPositiveChange(key, v);
    doc.rect(x, top, cardW, cardH, C.card, C.border);
    doc.text(x + 12, top - 18, METRIC_LABELS[key], 9, { color: C.muted });
    doc.text(x + 12, top - 40, fit(formatMetric(key, cur), 17, cardW - 24, true), 17, { bold: true });
    if (report.compare && v !== null) doc.text(x + 12, top - 54, formatVariation(v) + " vs. período anterior", 8, { color: good === null ? C.muted : good ? C.good : C.bad });
  });
  if (metrics.length) doc.y -= cardH + 24;

  // Per-platform table
  const platforms = Object.keys(report.byPlatform) as Array<keyof typeof PLATFORM_LABEL>;
  if (platforms.length > 1) {
    doc.ensure(80);
    doc.text(M, doc.y, "Resultados por plataforma", 13, { bold: true, color: C.good });
    doc.y -= 20;
    const cols2: Array<[MetricKey, number]> = [["spend", 270], ["impressions", 350], ["clicks", 420], ["conversions", 490], ["cpa", 555]];
    doc.text(M, doc.y, "Plataforma", 8.5, { bold: true, color: C.muted });
    for (const [k, x] of cols2) doc.text(x, doc.y, k === "cpa" ? "CPA" : METRIC_LABELS[k], 8.5, { bold: true, color: C.muted, align: "right" });
    doc.y -= 6;
    doc.line(M, doc.y, M + contentW, doc.y, C.border);
    doc.y -= 14;
    for (const p of platforms) {
      const t = report.byPlatform[p]?.current;
      if (!t) continue;
      doc.text(M, doc.y, PLATFORM_LABEL[p] ?? p, 10, { bold: true });
      for (const [k, x] of cols2) doc.text(x, doc.y, formatMetric(k, metricValue(k, t)), 10, { align: "right" });
      doc.y -= 18;
    }
    doc.y -= 12;
  }

  // Campaigns
  if (report.campaigns.length) {
    doc.ensure(60);
    doc.text(M, doc.y, "Principais campanhas", 13, { bold: true, color: C.good });
    doc.y -= 20;
    const header = () => {
      doc.text(M, doc.y, "Campanha", 8.5, { bold: true, color: C.muted });
      doc.text(330, doc.y, "Plataforma", 8.5, { bold: true, color: C.muted });
      doc.text(455, doc.y, "Investimento", 8.5, { bold: true, color: C.muted, align: "right" });
      doc.text(505, doc.y, "Cliques", 8.5, { bold: true, color: C.muted, align: "right" });
      doc.text(555, doc.y, "Conv.", 8.5, { bold: true, color: C.muted, align: "right" });
      doc.y -= 6;
      doc.line(M, doc.y, M + contentW, doc.y, C.border);
      doc.y -= 13;
    };
    header();
    for (const c of report.campaigns.slice(0, 25)) {
      if (doc.y < 70) {
        doc.newPage();
        header();
      }
      doc.text(M, doc.y, fit(c.name, 9, 280), 9);
      doc.text(330, doc.y, PLATFORM_LABEL[c.platform], 9, { color: C.muted });
      doc.text(455, doc.y, formatMetric("spend", c.spend), 9, { align: "right" });
      doc.text(505, doc.y, formatMetric("clicks", c.clicks), 9, { align: "right" });
      doc.text(555, doc.y, formatMetric("conversions", c.conversions), 9, { align: "right" });
      doc.y -= 15;
    }
    doc.y -= 10;
  }

  // Footer
  doc.ensure(50);
  doc.line(M, doc.y, M + contentW, doc.y, C.border);
  doc.y -= 16;
  if (panelUrl) {
    doc.text(M, doc.y, "Acompanhe os números ao vivo:", 9, { bold: true });
    doc.y -= 13;
    doc.text(M, doc.y, fit(panelUrl, 9, contentW), 9, { color: C.good });
    doc.y -= 15;
  }
  const generated = new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  doc.text(M, doc.y, `Gerado em ${generated} · Dados das plataformas de anúncio, sujeitos às regras de atribuição de cada uma.`, 7.5, { color: C.muted });

  return doc.toBytes();
}

export function reportPdfFilename(report: BuiltReport) {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  return `SCASE-${slug(report.clientName)}-${report.range.since}-a-${report.range.until}.pdf`;
}
