/**
 * Server-only: builds a report, renders the PDF and sends it by e-mail (Resend) and WhatsApp
 * (Meta WhatsApp Cloud API or Z-API). Every attempt is recorded in report_deliveries.
 *
 * Secrets (Lovable Cloud → Secrets):
 *  - APP_ORIGIN                     public origin used in links (already required by OAuth)
 *  - RESEND_API_KEY, REPORT_EMAIL_FROM ("SCASE Relatórios <relatorios@seudominio.com.br>")
 *  - WHATSAPP_PROVIDER              "meta" (default) or "zapi"
 *    meta: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME,
 *          WHATSAPP_TEMPLATE_LANGUAGE (default pt_BR), WHATSAPP_TEMPLATE_DOCUMENT_HEADER ("true" if the template has a document header)
 *    zapi: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
 */
import { buildReportFor, newReportToken, reportPanelUrl, reportPdfUrl, type BuiltReport } from "./report-data.server";
import { renderReportPdf, reportPdfFilename } from "./report-pdf.server";
import { periodLabel } from "./report-schedule";
import { METRIC_LABELS, formatDateBR, formatMetric, formatVariation, isPositiveChange, metricValue, variation } from "./report-metrics";
import { STATUS_COLORS, orderedMetrics } from "./report-insights";
import { loadChannels, sendEmailWith, type WhatsAppConfig } from "./delivery-channels.server";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const periodText = (r: BuiltReport) =>
  `${periodLabel(r.period) || "Período"} (${formatDateBR(r.range.since)} a ${formatDateBR(r.range.until)})`;

/** Returns the config's public token, creating one when it does not exist yet. */
export async function ensureShareToken(configId: string, current: string | null) {
  if (current) return current;
  const token = await newReportToken();
  const db = await admin();
  const { error } = await db.from("report_configs").update({ share_token: token }).eq("id", configId).is("share_token", null);
  if (error) throw new Error("Não foi possível criar o link do painel.");
  const { data } = await db.from("report_configs").select("share_token").eq("id", configId).maybeSingle();
  return data?.share_token ?? token;
}

export function reportEmailHtml(r: BuiltReport, panelUrl: string) {
  const td = "padding:10px 0;border-bottom:1px solid #e3efe7";
  const rows = orderedMetrics(r.metrics, r.objective)
    .slice(0, 8)
    .map((k) => {
      const cur = metricValue(k, r.total.current);
      const v = r.total.previous ? variation(cur, metricValue(k, r.total.previous)) : null;
      const good = isPositiveChange(k, v);
      const color = good === null ? "#61776a" : good ? "#087a48" : "#b91c1c";
      return `<tr><td style="${td};color:#61776a">${METRIC_LABELS[k]}</td><td style="${td};text-align:right;font-weight:700;color:#102f1d">${esc(formatMetric(k, cur))}</td><td style="${td};padding-left:12px;text-align:right;font-size:12px;color:${color}">${esc(formatVariation(v))}</td></tr>`;
    })
    .join("");
  const has = (s: string) => (r.sections as string[]).includes(s);
  const block = (title: string, body: string) => `<div style="margin:0 0 22px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#087a48;margin-bottom:8px">${title}</div>${body}</div>`;
  const para = (t: string) => `<p style="margin:0;line-height:1.55;color:#102f1d">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const highlights = has("highlights") && r.highlights.length ? block("DESTAQUES DO PERÍODO", `<ul style="margin:0;padding-left:18px;color:#102f1d;line-height:1.55">${r.highlights.map((h) => `<li style="margin-bottom:6px">${esc(h)}</li>`).join("")}</ul>`) : "";
  const goals =
    has("goals") && (r.goals.length || r.pacing)
      ? block(
          "METAS",
          [...r.goals.map((g) => ({ status: g.status, label: g.label, text: g.text })), ...(r.pacing ? [{ status: r.pacing.status, label: "Ritmo da verba", text: r.pacing.text }] : [])]
            .map((g) => `<div style="margin-bottom:8px"><span style="display:inline-block;background:${STATUS_COLORS[g.status].bg};color:${STATUS_COLORS[g.status].fg};font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px">${STATUS_COLORS[g.status].label}</span> <strong style="color:#102f1d">${esc(g.label)}:</strong> <span style="color:#3d5546">${esc(g.text)}</span></div>`)
            .join(""),
        )
      : "";
  const analysis = has("analysis") && r.analysis.notes ? block("ANÁLISE DA EQUIPE", para(r.analysis.notes)) : "";
  const next = has("analysis") && r.analysis.nextSteps ? block("PRÓXIMOS PASSOS", para(r.analysis.nextSteps)) : "";
  const tax = r.taxes.spendWithTax !== null ? `<p style="font-size:12px;color:#61776a;margin:8px 0 0">Investimento com impostos: <strong>${esc(formatMetric("spend", r.taxes.spendWithTax))}</strong></p>` : "";
  const intro = r.intro ? `<div style="margin:0 0 22px">${para(r.intro)}</div>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f1f6f3;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#082d20;padding:26px 30px">
<div style="color:#07e77e;font-size:11px;font-weight:700;letter-spacing:.08em">SCASE PERFORMANCE · RELATÓRIO</div>
<div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:8px">${esc(r.clientName)}</div>
<div style="color:#cfe9da;font-size:13px;margin-top:6px">${esc(r.reportName)} · ${esc(periodText(r))}</div>
</td></tr>
<tr><td style="padding:26px 30px">${intro}${highlights}
${block("NÚMEROS DO PERÍODO", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}</table>${tax}${r.compare ? `<p style="font-size:11px;color:#61776a;margin:8px 0 0">Variação em relação a ${formatDateBR(r.range.prevSince)} a ${formatDateBR(r.range.prevUntil)}.</p>` : ""}`)}
${goals}${analysis}${next}
<p style="margin:6px 0 8px"><a href="${esc(panelUrl)}" style="background:#07e77e;color:#062417;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">Ver painel completo</a></p>
<p style="font-size:12px;color:#61776a;margin:14px 0 0">O relatório completo em PDF está anexado. No painel você encontra gráficos, campanhas, criativos e público.</p>
</td></tr>
<tr><td style="padding:18px 30px;background:#f4faf6;font-size:11px;color:#61776a">Agência SCASE · Branding, design e performance</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendWhatsApp(cfg: WhatsAppConfig, phone: string, r: BuiltReport, panelUrl: string, pdfUrl: string, filename: string) {
  const digits = phone.replace(/\D/g, "");
  if (cfg.provider === "zapi") {
    const caption = `*${r.clientName}* · ${r.reportName}\n${periodText(r)}\n\nPainel ao vivo: ${panelUrl}`;
    const res = await fetch(`https://api.z-api.io/instances/${encodeURIComponent(cfg.instanceId)}/token/${encodeURIComponent(cfg.token)}/send-document/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.clientToken ? { "Client-Token": cfg.clientToken } : {}) },
      body: JSON.stringify({ phone: digits, document: pdfUrl, fileName: filename.replace(/\.pdf$/, ""), caption }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Z-API recusou o envio (" + res.status + ").");
    return;
  }
  // Business-initiated messages must use an approved template. Body variables: {{1}} cliente, {{2}} período, {{3}} link do painel.
  const components: unknown[] = [];
  if (cfg.documentHeader) components.push({ type: "header", parameters: [{ type: "document", document: { link: pdfUrl, filename } }] });
  components.push({ type: "body", parameters: [{ type: "text", text: r.clientName }, { type: "text", text: periodText(r) }, { type: "text", text: panelUrl }] });
  const res = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { authorization: "Bearer " + cfg.token, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: digits, type: "template", template: { name: cfg.templateName, language: { code: cfg.language || "pt_BR" }, components } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error("WhatsApp recusou o envio (" + res.status + ")" + (body.error?.message ? ": " + body.error.message : ""));
  }
}

export type DeliveryResult = { channel: "email" | "whatsapp"; recipient: string; status: "sent" | "failed"; error: string | null };

/** Builds and sends one report configuration to every recipient of its client. */
export async function deliverReport(configId: string, opts: { trigger: "schedule" | "manual"; scheduleId?: string | null }) {
  const built = await buildReportFor({ id: configId }, { fresh: true });
  if (!built) throw new Error("Configuração de relatório não encontrada.");
  const { config, client, report } = built;
  const db = await admin();
  const { data: clientRow } = await db.from("clients").select("emails,whatsapp_numbers").eq("id", config.client_id).maybeSingle();
  const token = await ensureShareToken(config.id, config.share_token);
  const panelUrl = reportPanelUrl(token);
  const pdf = renderReportPdf(report, panelUrl);
  const filename = reportPdfFilename(report);
  const channels = (config.channels ?? []).filter((c) => c === "email" || c === "whatsapp");
  const results: DeliveryResult[] = [];
  const delivery = await loadChannels();

  if (!client.active) throw new Error("Cliente inativo.");
  if (report.errors.length && report.campaigns.length === 0 && report.total.current.spend === 0)
    throw new Error("Nenhum dado pôde ser consultado: " + report.errors.join(" | "));

  if (channels.includes("email")) {
    const own = ((config as { email_to?: string[] | null }).email_to ?? []).filter(Boolean);
    const emails = own.length ? own : (clientRow?.emails ?? []).filter(Boolean);
    const customSubject = ((config as { email_subject?: string | null }).email_subject ?? "").trim();
    const subject = customSubject ? customSubject.replace(/\{cliente\}/gi, client.name).replace(/\{per[ií]odo\}/gi, periodText(report)) : `Relatório ${client.name} · ${periodText(report)}`;
    if (emails.length) {
      try {
        if (!delivery.email) throw new Error("E-mail ainda não conectado. Conecte em Integrações.");
        await sendEmailWith(delivery.email, emails, subject, reportEmailHtml(report, panelUrl), { filename, content: pdf });
        for (const e of emails) results.push({ channel: "email", recipient: e, status: "sent", error: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha no envio";
        for (const r of emails) results.push({ channel: "email", recipient: r, status: "failed", error: msg });
      }
    }
  }
  if (channels.includes("whatsapp")) {
    for (const phone of (clientRow?.whatsapp_numbers ?? []).filter(Boolean)) {
      try {
        if (!delivery.whatsapp) throw new Error("WhatsApp ainda não conectado. Conecte em Integrações.");
        await sendWhatsApp(delivery.whatsapp, phone, report, panelUrl, reportPdfUrl(token), filename);
        results.push({ channel: "whatsapp", recipient: phone, status: "sent", error: null });
      } catch (e) {
        results.push({ channel: "whatsapp", recipient: phone, status: "failed", error: e instanceof Error ? e.message : "Falha no envio" });
      }
    }
  }

  if (results.length) {
    await db.from("report_deliveries").insert(
      results.map((r) => ({
        report_config_id: config.id,
        schedule_id: opts.scheduleId ?? null,
        trigger: opts.trigger,
        channel: r.channel,
        recipient: r.recipient,
        status: r.status,
        error: r.error,
        report_url: panelUrl,
      })) as never,
    );
  }
  return { results, panelUrl, warnings: report.errors };
}
