import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { agencyApi } from "@/lib/agency-client";
import { ALL_SECTIONS, DETAIL_LEVELS, OBJECTIVES, SECTIONS, detectLevel, isObjective, metricsFor, type DetailLevel, type Objective } from "@/lib/report-insights";
import { supabase } from "@/integrations/supabase/client";
import { CampaignScope, type CampaignMode } from "./CampaignScope";
import { normalisePhone } from "./ClientForm";
import { E164, EMAIL, METRICS, WEEKDAYS, computeNextRun, formatNextRun, periodLabel, resolvePeriod, type Frequency, type ReportPeriod } from "@/lib/report-schedule";
import { DateRangePicker, presetLabel } from "./DateRangePicker";
import { PlatformMark } from "./PlatformMark";

export type ReportConfigRow = {
  id: string;
  client_id: string;
  name: string;
  platforms: string[];
  metrics: string[];
  period: ReportPeriod;
  compare_previous: boolean;
  campaign_filter: string | null;
  campaign_mode?: string | null;
  campaign_ids?: string[] | null;
  intro_message: string | null;
  email_subject?: string | null;
  email_to?: string[] | null;
  whatsapp_to?: string[] | null;
  channels: string[];
  share_token: string | null;
  active: boolean;
  objective: string;
  sections: string[];
  manager_notes: string | null;
  actions_taken: string | null;
  next_steps: string | null;
};
export type ScheduleRow = {
  id: string;
  report_config_id: string;
  frequency: Frequency;
  weekdays: number[];
  day_of_month: number | null;
  send_time: string;
  next_run_at: string | null;
  last_run_at: string | null;
  active: boolean;
};

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Chips<T extends string | number>({ options, value, onChange }: { options: ReadonlyArray<readonly [T, string]>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="rpChips">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className="rpChip" aria-pressed={value.includes(v)} onClick={() => onChange(toggle(value, v))}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rpModalHead">
          <h2>{title}</h2>
          <button className="iconButton" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Metrics only Meta reports (hidden for Google-only reports). */
const META_ONLY: string[] = ["reach", "frequency", "leads"];
/** Google reports start with phone calls selected; they only show when the period had calls. */
const withCalls = (list: string[], platforms: string[]) => (platforms.includes("google") && !list.includes("calls") ? [...list, "calls"] : list);

export function ReportConfigForm({ clientId, config, availablePlatforms, onClose, onSaved }: { clientId: string; config?: ReportConfigRow; availablePlatforms: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(config?.name ?? "Relatório semanal de performance");
  const [objective, setObjective] = useState<Objective>(config && isObjective(config.objective) ? config.objective : "leads");
  const [platforms, setPlatforms] = useState<string[]>(config?.platforms ?? (availablePlatforms.length ? availablePlatforms : ["meta", "google"]));
  const [metrics, setMetrics] = useState<string[]>(config?.metrics ?? withCalls(metricsFor("leads", "standard"), config?.platforms ?? availablePlatforms));
  const [sections, setSections] = useState<string[]>(config?.sections?.length ? config.sections : DETAIL_LEVELS.standard.sections);
  const level = detectLevel(sections);
  const [period, setPeriod] = useState<ReportPeriod>(config?.period ?? "last_7_days");
  const [compare, setCompare] = useState(config?.compare_previous ?? true);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>(config?.campaign_mode === "active" || config?.campaign_mode === "selected" ? config.campaign_mode : "all");
  const [campaignIds, setCampaignIds] = useState<string[]>(config?.campaign_ids ?? []);
  const [notes, setNotes] = useState(config?.manager_notes ?? "");
  const [channels, setChannels] = useState<string[]>(config?.channels ?? ["email"]);
  const [emailTo, setEmailTo] = useState((config?.email_to ?? []).join(", "));
  const [emailSubject, setEmailSubject] = useState(config?.email_subject ?? "");
  const [emailMessage, setEmailMessage] = useState(config?.intro_message ?? "");
  const [whatsTo, setWhatsTo] = useState((config?.whatsapp_to ?? []).join(", "));
  // Pre-fill recipients with the client's e-mails when the report has none of its own.
  useEffect(() => {
    if (config?.email_to?.length && config?.whatsapp_to?.length) return;
    void supabase
      .from("clients")
      .select("emails,whatsapp_numbers")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { emails?: string[]; whatsapp_numbers?: string[] } | null;
        const list = (row?.emails ?? []).filter(Boolean);
        if (list.length && !config?.email_to?.length) setEmailTo((cur) => cur || list.join(", "));
        const phones = (row?.whatsapp_numbers ?? []).filter(Boolean);
        if (phones.length && !config?.whatsapp_to?.length) setWhatsTo((cur) => cur || phones.join(", "));
      });
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState(config?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  function pickObjective(o: Objective) {
    setObjective(o);
    // New reports follow the objective's metric preset; existing ones keep the agency's choice.
    if (!config) setMetrics(withCalls(metricsFor(o, level ?? "standard"), platforms));
  }

  function pickLevel(l: DetailLevel) {
    setSections(DETAIL_LEVELS[l].sections);
    setMetrics(withCalls(metricsFor(objective, l), platforms));
  }

  async function suggest() {
    if (notes.trim() && !window.confirm("Substituir o texto atual da análise por uma nova?")) return;
    setDrafting(true);
    setError("");
    setDraftNote("");
    try {
      const r = await agencyApi<{ text: string; source: "ia" | "numeros"; note?: string }>(`/api/integrations/clients/${clientId}/analysis`, {
        method: "POST",
        body: { platforms, period, compare_previous: compare, campaign_mode: campaignMode, campaign_ids: campaignMode === "selected" ? campaignIds : [], objective, metrics },
      });
      if (!r.text) setError("Ainda não há dados suficientes no período para escrever a análise.");
      else setNotes(r.text);
      if (r.source === "numeros") setDraftNote(r.note ? r.note + " Usamos um texto montado a partir dos números." : "Texto montado a partir dos números.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a análise.");
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    setError("");
    if (!name.trim()) return setError("Dê um nome ao relatório.");
    if (!platforms.length) return setError("Escolha pelo menos uma plataforma.");
    if (!metrics.length) return setError("Escolha pelo menos uma métrica.");
    if (!channels.length) return setError("Escolha pelo menos um canal de envio.");
    const recipients: string[] = [...new Set<string>(emailTo.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    if (channels.includes("email")) {
      const bad = recipients.find((x) => !EMAIL.test(x));
      if (bad) return setError(`E-mail inválido: ${bad}`);
      if (!recipients.length) return setError("Informe pelo menos um e-mail de destino.");
    }
    const phones: string[] = [...new Set<string>(whatsTo.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map(normalisePhone))];
    if (channels.includes("whatsapp")) {
      const badPhone = phones.find((x) => !E164.test(x));
      if (badPhone) return setError(`Número de WhatsApp inválido: ${badPhone}. Use DDD + número, ex.: 14 99999-9999.`);
      if (!phones.length) return setError("Informe pelo menos um número de WhatsApp.");
    }
    if (campaignMode === "selected" && !campaignIds.length) return setError("Marque pelo menos uma campanha ou escolha outra opção em Campanhas do relatório.");
    setSaving(true);
    const ordered = METRICS.map(([k]) => k as string).filter((k) => metrics.includes(k));
    const payload = {
      client_id: clientId,
      name: name.trim(),
      objective,
      platforms,
      metrics: ordered,
      sections: ALL_SECTIONS.filter((k) => sections.includes(k)),
      period,
      compare_previous: compare,
      campaign_filter: null,
      campaign_mode: campaignMode,
      campaign_ids: campaignMode === "selected" ? campaignIds : [],
      intro_message: channels.includes("email") ? emailMessage.trim() || null : null,
      email_subject: channels.includes("email") ? emailSubject.trim().slice(0, 200) || null : null,
      email_to: channels.includes("email") ? recipients : [],
      whatsapp_to: channels.includes("whatsapp") ? phones : [],
      manager_notes: notes.trim() || null,
      actions_taken: null,
      next_steps: null,
      channels,
      active,
      updated_at: new Date().toISOString(),
    };
    const res = config
      ? await supabase.from("report_configs").update(payload).eq("id", config.id).select("id").single()
      : await supabase.from("report_configs").insert(payload).select("id").single();
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Não foi possível salvar.");
    onSaved(res.data.id);
  }

  return (
    <Modal title={config ? "Editar relatório" : "Novo relatório"} onClose={onClose}>
      <label className="rpField">
        <span>Nome do relatório</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="rpField">
        <span>Objetivo do cliente</span>
        <div className="rpObjectives" role="radiogroup">
          {(Object.keys(OBJECTIVES) as Objective[]).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={objective === o} className="rpObjective" onClick={() => pickObjective(o)}>
              <strong>{OBJECTIVES[o].label}</strong>
              <small>{OBJECTIVES[o].description}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="rpField">
        <span>Nível de detalhe</span>
        <div className="rpObjectives rpLevels" role="radiogroup">
          {(Object.keys(DETAIL_LEVELS) as DetailLevel[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} className="rpObjective" onClick={() => pickLevel(l)}>
              <strong>{DETAIL_LEVELS[l].label}</strong>
              <small>{DETAIL_LEVELS[l].description}</small>
            </button>
          ))}
        </div>
        <small>{level ? "Ajuste seções e métricas abaixo se quiser personalizar." : "Personalizado: seções escolhidas manualmente abaixo."}</small>
      </div>
      <div className="rpField">
        <span>Plataforma do relatório</span>
        <div className="rfPlatforms" role="radiogroup">
          {(
            [
              [["meta"], "Meta Ads"],
              [["google"], "Google Ads"],
              [["meta", "google"], "Meta + Google"],
            ] as Array<[string[], string]>
          ).map(([value, label]) => {
            const chosen = value.length === platforms.length && value.every((v) => platforms.includes(v));
            const missing = value.filter((v) => !availablePlatforms.includes(v));
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={chosen}
                className="rpObjective rfPlatform"
                disabled={missing.length === value.length}
                onClick={() => {
                  setPlatforms(value);
                  setMetrics((cur) => withCalls(cur, value));
                  setCampaignIds((cur) => cur.filter((k) => value.some((v) => k.startsWith(v + ":"))));
                }}
              >
                <span className="rfMarks">
                  {value.map((v) => (
                    <PlatformMark key={v} platform={v as "meta" | "google"} size={18} />
                  ))}
                </span>
                <strong>{label}</strong>
                <small>{missing.length === value.length ? "Sem conta vinculada" : missing.length ? "Falta conta vinculada em uma delas" : "Contas vinculadas"}</small>
              </button>
            );
          })}
        </div>
      </div>
      <CampaignScope clientId={clientId} platforms={platforms} mode={campaignMode} onMode={setCampaignMode} selected={campaignIds} onSelected={setCampaignIds} />
      <div className="rpField">
        <span>Período analisado</span>
        <DateRangePicker
          value={(() => {
            const r = resolvePeriod(period, "America/Sao_Paulo");
            return { from: r.since, to: r.until, label: presetLabel(period) ?? periodLabel(period), code: period };
          })()}
          onApply={(_from, _to, _label, code) => setPeriod(code)}
          compare={compare}
          onCompare={setCompare}
        />
        <small>
          {period.startsWith("custom_")
            ? "Datas fixas: todo envio mostra exatamente esse período."
            : "Período móvel: a cada envio as datas avançam (ex.: “7 dias atrás” sempre termina no dia do envio)."}
        </small>
      </div>
      <label className="rpCheck" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparar com o período anterior
      </label>
      <div className="rpField">
        <span>Métricas</span>
        <Chips<string> options={METRICS.filter(([k]) => (platforms.includes("meta") || !META_ONLY.includes(k)) && (platforms.includes("google") || k !== "calls"))} value={metrics} onChange={setMetrics} />
        <small>As principais do objetivo aparecem em destaque. Ligações (Google) só aparecem quando a conta recebeu ligações no período.</small>
      </div>
      <div className="rpField">
        <span>Seções do relatório</span>
        <Chips<string> options={SECTIONS} value={sections} onChange={setSections} />
        <small>Seções sem dados no período são omitidas automaticamente.</small>
      </div>

      <h3 className="rpFormGroup">Análise do período</h3>
      <p className="rpFormHint">Vai no topo do relatório e do e-mail. Atualize antes de cada envio; os destaques automáticos entram de qualquer forma.</p>
      <div className="rpField">
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          Texto da análise
          <button type="button" className="textLink" disabled={drafting} onClick={suggest}>
            <Sparkles size={13} /> {drafting ? "Escrevendo a análise…" : notes.trim() ? "Gerar nova análise" : "Gerar análise do período"}
          </button>
        </span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="O que aconteceu no período e por quê." />
        <small>{draftNote || "A análise usa os números da plataforma, do período e das campanhas escolhidos acima. Revise antes de salvar; você pode editar o texto à vontade."}</small>
      </div>

      <div className="rpTwo">
        <div className="rpField">
          <span>Canais de envio</span>
          <Chips<string> options={[["email", "E-mail"], ["whatsapp", "WhatsApp"]] as const} value={channels} onChange={setChannels} />
        </div>
        <label className="rpCheck" style={{ alignSelf: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Relatório ativo
        </label>
      </div>
      {channels.includes("email") && (
        <div className="rfEmail">
          <h3 className="rpFormGroup">E-mail para o cliente</h3>
          <label className="rpField">
            <span>Enviar para</span>
            <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="cliente@empresa.com.br, financeiro@empresa.com.br" inputMode="email" />
            <small>Separe vários e-mails com vírgula. Vem preenchido com os e-mails do cadastro do cliente.</small>
          </label>
          <label className="rpField">
            <span>Assunto</span>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} maxLength={200} placeholder="Relatório {cliente} · {período}" />
            <small>Pode usar {"{cliente}"} e {"{período}"}; eles são trocados pelo nome do cliente e pelas datas do relatório. Em branco, usamos o assunto padrão.</small>
          </label>
          <label className="rpField">
            <span>Mensagem</span>
            <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={5} placeholder={"Olá! Tudo bem?\nSegue o relatório de performance do período. O PDF está em anexo e o painel completo pode ser aberto pelo botão abaixo."} />
            <small>Vai no começo do e-mail, antes dos números. O PDF segue em anexo e o link do painel vai em um botão.</small>
          </label>
        </div>
      )}
      {channels.includes("whatsapp") && (
        <div className="rfEmail">
          <h3 className="rpFormGroup">WhatsApp para o cliente</h3>
          <label className="rpField">
            <span>Enviar para</span>
            <input value={whatsTo} onChange={(e) => setWhatsTo(e.target.value)} placeholder="14 99999-9999, 14 98888-8888" inputMode="tel" />
            <small>Com DDD; separe vários números com vírgula. Vem preenchido com o WhatsApp do cadastro do cliente.</small>
          </label>
          <div className="rpField">
            <span>Mensagem que o cliente recebe</span>
            <div className="rfWaPreview">
              <div className="rfWaDoc">📄 Relatório em PDF</div>
              <p>
                Olá! Segue o relatório de performance de <b>{"{nome do cliente}"}</b> referente a <b>{"{período}"}</b>. Acompanhe também o painel completo: <b>{"{link do painel}"}</b>
              </p>
            </div>
            <small>Pela API oficial da Meta, o texto é o modelo aprovado no WhatsApp Business; o nome, o período, o link e o PDF entram sozinhos em cada envio.</small>
          </div>
        </div>
      )}
      {error && <p className="rpError">{error}</p>}
      <div className="rpModalFoot">
        <button className="secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar relatório"}
        </button>
      </div>
    </Modal>
  );
}

export function ScheduleForm({ configId, timezone, schedule, onClose, onSaved }: { configId: string; timezone: string; schedule?: ScheduleRow; onClose: () => void; onSaved: () => void }) {
  const [frequency, setFrequency] = useState<Frequency>(schedule?.frequency ?? "weekly");
  const [weekdays, setWeekdays] = useState<number[]>(schedule?.weekdays?.length ? schedule.weekdays : [1]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(schedule?.day_of_month ?? 1);
  const [time, setTime] = useState((schedule?.send_time ?? "09:00").slice(0, 5));
  const [active, setActive] = useState(schedule?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const input = { frequency, weekdays: frequency === "monthly" ? [] : weekdays, day_of_month: frequency === "monthly" ? dayOfMonth : null, send_time: time };
  const next = useMemo(() => (/^\d{2}:\d{2}$/.test(time) ? computeNextRun(input, timezone) : null), [frequency, weekdays, dayOfMonth, time, timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError("");
    if (frequency !== "monthly" && !weekdays.length) return setError("Escolha pelo menos um dia da semana.");
    if (!/^\d{2}:\d{2}$/.test(time)) return setError("Horário inválido.");
    setSaving(true);
    const payload = { report_config_id: configId, ...input, next_run_at: active ? next?.toISOString() ?? null : null, active, updated_at: new Date().toISOString() };
    const res = schedule ? await supabase.from("report_schedules").update(payload).eq("id", schedule.id) : await supabase.from("report_schedules").insert(payload);
    setSaving(false);
    if (res.error) return setError(res.error.message);
    onSaved();
  }

  return (
    <Modal title={schedule ? "Editar agenda" : "Programar envio"} onClose={onClose}>
      <div className="rpTwo">
        <label className="rpField">
          <span>Frequência</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal (a cada 14 dias)</option>
            <option value="monthly">Mensal</option>
          </select>
        </label>
        <label className="rpField">
          <span>Horário de envio</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <small>No fuso do cliente ({timezone}).</small>
        </label>
      </div>
      {frequency === "monthly" ? (
        <label className="rpField">
          <span>Dia do mês</span>
          <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Dia {d}
                {d > 28 ? " (ou último dia do mês)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="rpField">
          <span>{frequency === "biweekly" ? "Dia da semana" : "Dias da semana"}</span>
          <Chips options={WEEKDAYS.map((l, i) => [i, l] as const)} value={weekdays} onChange={(v) => setWeekdays(frequency === "biweekly" ? v.slice(-1) : v)} />
        </div>
      )}
      <label className="rpCheck" style={{ margin: "4px 0 14px" }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Agenda ativa
      </label>
      <div className="rpSchedule">
        <span>Próximo envio</span>
        <span className="rpNext">{active ? formatNextRun(next, timezone) : "Agenda pausada"}</span>
      </div>
      {error && <p className="rpError">{error}</p>}
      <div className="rpModalFoot">
        <button className="secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar agenda"}
        </button>
      </div>
    </Modal>
  );
}
