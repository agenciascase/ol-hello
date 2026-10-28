import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CalendarClock, Copy, Download, ExternalLink, FileBarChart2, Link2, Pencil, Plus, Send, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AgencyShell } from "@/components/agency/AgencyShell";
import { CLIENT_COLUMNS, ClientForm, type ClientRow } from "@/components/agency/ClientForm";
import { AccountLinker } from "@/components/agency/AccountLinker";
import { ReportConfigForm, ScheduleForm, type ReportConfigRow, type ScheduleRow } from "@/components/agency/ReportForms";
import { agencyApi, agencyDownload } from "@/lib/agency-client";
import { METRIC_LABELS, isMetricKey } from "@/lib/report-metrics";
import { DETAIL_LEVELS, OBJECTIVES, detectLevel, isObjective } from "@/lib/report-insights";
import { WEEKDAYS, formatNextRun, periodLabel, resolvePeriod } from "@/lib/report-schedule";

export const Route = createFileRoute("/_authenticated/clientes/$clientId")({ component: ClientDetailPage });

type LinkedAccount = { id: string; provider: "meta" | "google"; account_id: string; account_name: string };
type Delivery = { id: string; report_config_id: string; sent_at: string; channel: string; recipient: string; status: string; error: string | null; trigger: string };
type DeliveryResponse = { results: Array<{ channel: string; recipient: string; status: string; error: string | null }>; panelUrl: string; warnings: string[] };

function scheduleText(s: ScheduleRow) {
  const time = s.send_time.slice(0, 5);
  if (s.frequency === "monthly") return `Todo dia ${s.day_of_month ?? 1} do mês, às ${time}`;
  const days = [...s.weekdays].sort().map((d) => WEEKDAYS[d]).join(", ");
  return `${s.frequency === "biweekly" ? "A cada 2 semanas" : "Toda semana"} · ${days} às ${time}`;
}

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const [editingClient, setEditingClient] = useState(false);
  const [linking, setLinking] = useState(false);
  const [reportForm, setReportForm] = useState<{ config?: ReportConfigRow } | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{ configId: string; schedule?: ScheduleRow } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const [client, accounts, configs] = await Promise.all([
        supabase.from("clients").select(CLIENT_COLUMNS).eq("id", clientId).maybeSingle(),
        supabase.from("client_ad_accounts").select("id,provider,account_id,account_name").eq("client_id", clientId).order("provider"),
        supabase
          .from("report_configs")
          .select("id,client_id,name,platforms,metrics,period,compare_previous,campaign_filter,campaign_mode,campaign_ids,intro_message,channels,share_token,active,objective,sections,manager_notes,actions_taken,next_steps,report_schedules(id,report_config_id,frequency,weekdays,day_of_month,send_time,next_run_at,last_run_at,active)")
          .eq("client_id", clientId)
          .order("created_at"),
      ]);
      if (client.error) throw new Error(client.error.message);
      if (!client.data) throw new Error("Cliente não encontrado.");
      const cfgs = (configs.data ?? []) as unknown as Array<ReportConfigRow & { report_schedules: ScheduleRow[] }>;
      const ids = cfgs.map((c) => c.id);
      const deliveries = ids.length
        ? await supabase.from("report_deliveries").select("id,report_config_id,sent_at,channel,recipient,status,error,trigger").in("report_config_id", ids).order("sent_at", { ascending: false }).limit(30)
        : { data: [] };
      return {
        client: client.data as unknown as ClientRow,
        accounts: (accounts.data ?? []) as LinkedAccount[],
        configs: cfgs,
        deliveries: (deliveries.data ?? []) as Delivery[],
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-detail", clientId] });

  async function shareUrl(configId: string, action: "create" | "rotate" | "revoke" = "create") {
    const r = await agencyApi<{ url: string | null }>(`/api/integrations/reports/${configId}/share`, { method: "POST", body: { action } });
    refresh();
    return r.url;
  }
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setBusy(null);
    }
  }

  if (data.isLoading)
    return (
      <AgencyShell title="Cliente">
        <section className="panel rpEmpty">Carregando…</section>
      </AgencyShell>
    );
  if (data.isError || !data.data)
    return (
      <AgencyShell title="Cliente">
        <section className="panel rpEmpty">
          <p className="rpError">{(data.error as Error)?.message ?? "Cliente não encontrado."}</p>
          <Link to="/clientes">Voltar para clientes</Link>
        </section>
      </AgencyShell>
    );

  const { client, accounts, configs, deliveries } = data.data;
  const linkedPlatforms: string[] = Array.from(new Set<string>(accounts.map((a) => a.provider)));
  const configName = (id: string) => configs.find((c) => c.id === id)?.name ?? "Relatório";

  return (
    <AgencyShell
      eyebrow="CLIENTE"
      title={client.name}
      description={[client.owner_name, client.active ? null : "Inativo"].filter(Boolean).join(" · ")}
      actions={
        <>
          <Link to="/clientes" className="secondary">
            <ArrowLeft size={16} /> Clientes
          </Link>
          <button className="secondary" type="button" onClick={() => setEditingClient(true)}>
            <Pencil size={16} /> Editar dados
          </button>
          <button className="primary" type="button" onClick={() => setReportForm({})}>
            <Plus size={16} /> Novo relatório
          </button>
        </>
      }
    >
      <div className="rpTwo" style={{ marginBottom: 16 }}>
        <section className="panel rpCard">
          <h2>
            <Link2 size={18} /> Contas vinculadas
          </h2>
          <p className="rpHint">Contas da BM e da MCC que alimentam os relatórios deste cliente.</p>
          <div className="rpList">
            {accounts.length === 0 && <p style={{ color: "var(--muted)" }}>Nenhuma conta vinculada ainda.</p>}
            {accounts.map((a) => (
              <div key={a.id} className="rpRow">
                <div className="rpRowMain">
                  <strong>{a.account_name}</strong>
                  <small>{a.provider === "google" ? a.account_id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : a.account_id}</small>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={"network " + a.provider}>{a.provider === "meta" ? "Meta" : "Google"}</span>
                  <button
                    className="iconButton danger"
                    title="Desvincular"
                    onClick={() =>
                      run("unlink" + a.id, async () => {
                        if (!window.confirm(`Desvincular ${a.account_name}?`)) return;
                        const { error } = await supabase.from("client_ad_accounts").delete().eq("id", a.id);
                        if (error) throw new Error(error.message);
                        refresh();
                      })
                    }
                  >
                    <Unlink size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="rpRow">
            <span />
            <button className="secondary" type="button" onClick={() => setLinking(true)}>
              <Plus size={15} /> Vincular contas
            </button>
          </div>
        </section>

        <section className="panel rpCard">
          <h2>
            <Send size={18} /> Destinatários
          </h2>
          <p className="rpHint">Quem recebe os relatórios deste cliente.</p>
          <div className="rpRow">
            <div className="rpRowMain">
              <strong>E-mail</strong>
              <small>{client.emails.length ? client.emails.join(", ") : "Nenhum e-mail cadastrado"}</small>
            </div>
          </div>
          <div className="rpRow">
            <div className="rpRowMain">
              <strong>WhatsApp</strong>
              <small>{client.whatsapp_numbers.length ? client.whatsapp_numbers.join(", ") : "Nenhum número cadastrado"}</small>
            </div>
          </div>
        </section>
      </div>

      <div className="sectionTitle">
        <h2>Relatórios e agendas</h2>
      </div>
      <div className="rpGrid" style={{ marginBottom: 20 }}>
        {configs.length === 0 && (
          <section className="panel rpEmpty">
            <h2>Nenhum relatório configurado</h2>
            <p>Crie um relatório escolhendo métricas, período e canais; depois programe os dias de envio.</p>
          </section>
        )}
        {configs.map((c) => (
          <section key={c.id} className="panel rpReport">
            <div className="rpReportHead">
              <div className="rpRowMain">
                <strong style={{ fontSize: 15, display: "flex", gap: 8, alignItems: "center" }}>
                  <FileBarChart2 size={17} color="#0baa59" /> {c.name} {!c.active && <span className="rpBadge">Pausado</span>}
                </strong>
                <small>
                  {isObjective(c.objective) ? OBJECTIVES[c.objective].label : "Geração de leads"} · nível {(() => { const l = detectLevel(c.sections ?? []); return l ? DETAIL_LEVELS[l].label.toLowerCase() : "personalizado"; })()} · {(periodLabel(c.period) || (() => { const r = resolvePeriod(c.period, "America/Sao_Paulo"); return `${r.since.split("-").reverse().join("/")} a ${r.until.split("-").reverse().join("/")}`; })())}
                  {c.compare_previous ? " · com comparação" : ""} · {c.platforms.map((p) => (p === "meta" ? "Meta" : "Google")).join(" + ")} ·{" "}
                  {c.channels.map((ch) => (ch === "email" ? "E-mail" : "WhatsApp")).join(" + ")}
                  {c.campaign_mode === "active" ? " · só campanhas ativas" : c.campaign_mode === "selected" ? ` · ${c.campaign_ids?.length ?? 0} campanha(s) escolhida(s)` : ""}
                  {c.campaign_filter ? ` · campanhas com “${c.campaign_filter}”` : ""}
                </small>
                <small>{c.metrics.filter(isMetricKey).map((m) => METRIC_LABELS[m]).join(" · ")}</small>
              </div>
              <div className="rpActions">
                <button className="secondary rpSmallBtn" type="button" onClick={() => setReportForm({ config: c })}>
                  <Pencil size={14} /> Editar
                </button>
                <button
                  className="secondary rpSmallBtn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run("open" + c.id, async () => {
                      const win = window.open("", "_blank");
                      const url = await shareUrl(c.id);
                      if (url && win) win.location.href = url;
                      else if (url) window.location.assign(url);
                    })
                  }
                >
                  <ExternalLink size={14} /> Gerar agora
                </button>
                <button
                  className="secondary rpSmallBtn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run("copy" + c.id, async () => {
                      const url = await shareUrl(c.id);
                      if (url) {
                        await navigator.clipboard.writeText(url);
                        toast.success("Link do painel copiado");
                      }
                    })
                  }
                >
                  <Copy size={14} /> Copiar link
                </button>
                <button
                  className="secondary rpSmallBtn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("pdf" + c.id, () => agencyDownload(`/api/integrations/reports/${c.id}/pdf`, "relatorio.pdf"))}
                >
                  <Download size={14} /> {busy === "pdf" + c.id ? "Gerando…" : "PDF"}
                </button>
                <button
                  className="primary rpSmallBtn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run("send" + c.id, async () => {
                      const who = [...(c.channels.includes("email") ? client.emails : []), ...(c.channels.includes("whatsapp") ? client.whatsapp_numbers : [])];
                      if (!who.length) throw new Error("Cadastre e-mails ou WhatsApp do cliente para os canais escolhidos.");
                      if (!window.confirm(`Enviar "${c.name}" agora para ${who.length} destinatário(s)?`)) return;
                      const r = await agencyApi<DeliveryResponse>(`/api/integrations/reports/${c.id}/send`, { method: "POST", body: {} });
                      const failed = r.results.filter((x) => x.status === "failed");
                      if (!failed.length) toast.success(`Relatório enviado para ${r.results.length} destinatário(s)`);
                      else toast.error(`${failed.length} envio(s) falharam: ${failed[0]?.error ?? ""}`);
                      for (const w of r.warnings) toast.warning(w);
                      refresh();
                    })
                  }
                >
                  <Send size={14} /> {busy === "send" + c.id ? "Enviando…" : "Enviar agora"}
                </button>
              </div>
            </div>

            {c.report_schedules.map((s) => (
              <div key={s.id} className="rpSchedule">
                <div className="rpRowMain">
                  <strong style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <CalendarClock size={15} /> {scheduleText(s)}
                  </strong>
                  <small>
                    {s.active ? (
                      <>
                        Próximo envio: <span className="rpNext">{formatNextRun(s.next_run_at ? new Date(s.next_run_at) : null, client.timezone)}</span>
                      </>
                    ) : (
                      "Agenda pausada"
                    )}
                    {s.last_run_at ? ` · último: ${new Date(s.last_run_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                  </small>
                </div>
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="iconButton" title="Editar agenda" onClick={() => setScheduleForm({ configId: c.id, schedule: s })}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="iconButton danger"
                    title="Excluir agenda"
                    onClick={() =>
                      run("del" + s.id, async () => {
                        if (!window.confirm("Excluir esta agenda?")) return;
                        const { error } = await supabase.from("report_schedules").delete().eq("id", s.id);
                        if (error) throw new Error(error.message);
                        refresh();
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <button className="textLink" type="button" onClick={() => setScheduleForm({ configId: c.id })}>
                <Plus size={14} /> Programar envio
              </button>
              <span style={{ display: "flex", gap: 14 }}>
                {c.share_token && (
                  <>
                    <button className="textLink" type="button" onClick={() => run("rot" + c.id, async () => { if (window.confirm("Gerar um link novo? O link atual deixa de funcionar.")) { await shareUrl(c.id, "rotate"); toast.success("Novo link gerado"); } })}>
                      Trocar link
                    </button>
                    <button className="textLink danger" type="button" onClick={() => run("rev" + c.id, async () => { if (window.confirm("Revogar o link público deste relatório?")) { await shareUrl(c.id, "revoke"); toast.success("Link revogado"); } })}>
                      Revogar link
                    </button>
                  </>
                )}
                <button
                  className="textLink danger"
                  type="button"
                  onClick={() =>
                    run("delc" + c.id, async () => {
                      if (!window.confirm(`Excluir o relatório "${c.name}" e suas agendas?`)) return;
                      const { error } = await supabase.from("report_configs").delete().eq("id", c.id);
                      if (error) throw new Error(error.message);
                      refresh();
                    })
                  }
                >
                  Excluir relatório
                </button>
              </span>
            </div>
          </section>
        ))}
      </div>

      <section className="panel tablePanel">
        <div className="panelHead">
          <div>
            <h2>Histórico de envios</h2>
            <p>Últimos 30 envios deste cliente.</p>
          </div>
        </div>
        <div className="tableScroll">
          <table className="rpTable">
            <thead>
              <tr>
                <th>Data</th>
                <th>Relatório</th>
                <th>Canal</th>
                <th>Destinatário</th>
                <th>Origem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum envio ainda.</td>
                </tr>
              )}
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{configName(d.report_config_id)}</td>
                  <td>{d.channel === "email" ? "E-mail" : "WhatsApp"}</td>
                  <td>{d.recipient}</td>
                  <td>{d.trigger === "schedule" ? "Agenda" : "Manual"}</td>
                  <td title={d.error ?? ""}>
                    <span className={"rpBadge " + (d.status === "sent" ? "ok" : d.status === "failed" ? "bad" : "")}>{d.status === "sent" ? "Enviado" : d.status === "failed" ? "Falhou" : "Pendente"}</span>
                    {d.error && <div className="rpError" style={{ maxWidth: 320, whiteSpace: "normal" }}>{d.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingClient && (
        <ClientForm
          client={client}
          onClose={() => setEditingClient(false)}
          onSaved={() => {
            setEditingClient(false);
            refresh();
            qc.invalidateQueries({ queryKey: ["clients"] });
          }}
        />
      )}
      {linking && (
        <AccountLinker
          clientId={client.id}
          linked={accounts}
          onClose={() => setLinking(false)}
          onSaved={() => {
            setLinking(false);
            refresh();
          }}
        />
      )}
      {reportForm && (
        <ReportConfigForm
          clientId={client.id}
          availablePlatforms={linkedPlatforms}
          {...(reportForm.config ? { config: reportForm.config } : {})}
          onClose={() => setReportForm(null)}
          onSaved={(id) => {
            const isNew = !reportForm.config;
            setReportForm(null);
            refresh();
            if (isNew) setScheduleForm({ configId: id });
          }}
        />
      )}
      {scheduleForm && (
        <ScheduleForm
          configId={scheduleForm.configId}
          timezone={client.timezone}
          {...(scheduleForm.schedule ? { schedule: scheduleForm.schedule } : {})}
          onClose={() => setScheduleForm(null)}
          onSaved={() => {
            setScheduleForm(null);
            refresh();
          }}
        />
      )}
    </AgencyShell>
  );
}
