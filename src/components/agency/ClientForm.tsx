import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { E164, EMAIL } from "@/lib/report-schedule";

export type ClientRow = {
  id: string;
  name: string;
  owner_name: string | null;
  logo_url: string | null;
  emails: string[];
  whatsapp_numbers: string[];
  timezone: string;
  active: boolean;
  monthly_budget: number | null;
  goal_cpa: number | null;
  goal_conversions_month: number | null;
  goal_roas: number | null;
  meta_tax_pct: number;
  google_tax_pct: number;
};

export const CLIENT_COLUMNS = "id,name,owner_name,logo_url,emails,whatsapp_numbers,timezone,active,monthly_budget,goal_cpa,goal_conversions_month,goal_roas,meta_tax_pct,google_tax_pct";

/** Parses a Brazilian-formatted number ("1.234,56", "12,5" or "12.5"); empty → null. */
export function parseNumberBR(text: string): number | null | "invalid" {
  const t = text.trim().replace(/^R\$\s*/, "").replace(/%$/, "");
  if (!t) return null;
  const normalised = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalised);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}
const showNumber = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export const TIMEZONES = [
  ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, GO, DF, BA…)"],
  ["America/Manaus", "Amazonas"],
  ["America/Cuiaba", "Mato Grosso"],
  ["America/Campo_Grande", "Mato Grosso do Sul"],
  ["America/Porto_Velho", "Rondônia"],
  ["America/Boa_Vista", "Roraima"],
  ["America/Rio_Branco", "Acre"],
  ["America/Belem", "Pará / Amapá"],
  ["America/Fortaleza", "Ceará / RN / PB / PI / MA"],
  ["America/Recife", "Pernambuco"],
  ["America/Maceio", "Alagoas / Sergipe"],
  ["America/Araguaina", "Tocantins"],
  ["America/Noronha", "Fernando de Noronha"],
  ["Europe/Lisbon", "Portugal"],
  ["America/New_York", "EUA (Leste)"],
] as const;

const splitList = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Normalises a Brazilian phone typed in any format to E.164 (+55…). */
export function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  return "+" + digits;
}

export function ClientForm({ client, onClose, onSaved }: { client?: ClientRow; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(client?.name ?? "");
  const [owner, setOwner] = useState(client?.owner_name ?? "");
  const [logo, setLogo] = useState(client?.logo_url ?? "");
  const [emails, setEmails] = useState((client?.emails ?? []).join("\n"));
  const [phones, setPhones] = useState((client?.whatsapp_numbers ?? []).join("\n"));
  const [timezone, setTimezone] = useState(client?.timezone ?? "America/Sao_Paulo");
  const [active, setActive] = useState(client?.active ?? true);
  const [budget, setBudget] = useState(showNumber(client?.monthly_budget));
  const [goalCpa, setGoalCpa] = useState(showNumber(client?.goal_cpa));
  const [goalConv, setGoalConv] = useState(showNumber(client?.goal_conversions_month));
  const [goalRoas, setGoalRoas] = useState(showNumber(client?.goal_roas));
  const [metaTax, setMetaTax] = useState(showNumber(client?.meta_tax_pct ?? 0));
  const [googleTax, setGoogleTax] = useState(showNumber(client?.google_tax_pct ?? 0));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError("");
    const emailList = splitList(emails).map((e) => e.toLowerCase());
    const phoneList = splitList(phones).map(normalisePhone);
    if (!name.trim()) return setError("Informe o nome do cliente.");
    const badEmail = emailList.find((e) => !EMAIL.test(e));
    if (badEmail) return setError(`E-mail inválido: ${badEmail}`);
    const badPhone = phoneList.find((p) => !E164.test(p));
    if (badPhone) return setError(`WhatsApp inválido: ${badPhone}. Use DDD + número, ex.: 11 98765-4321.`);
    if (logo && !/^https:\/\//.test(logo)) return setError("A logo precisa ser um link https.");
    const nums = { budget: parseNumberBR(budget), goalCpa: parseNumberBR(goalCpa), goalConv: parseNumberBR(goalConv), goalRoas: parseNumberBR(goalRoas), metaTax: parseNumberBR(metaTax), googleTax: parseNumberBR(googleTax) };
    if (Object.values(nums).includes("invalid")) return setError("Confira as metas, a verba e os impostos: use apenas números, como 15.000 ou 12,15.");
    const num = (v: number | null | "invalid") => (v === "invalid" ? null : v);
    if ((num(nums.metaTax) ?? 0) > 100 || (num(nums.googleTax) ?? 0) > 100) return setError("Os impostos devem ficar entre 0% e 100%.");
    setSaving(true);
    const payload = {
      monthly_budget: num(nums.budget) || null,
      goal_cpa: num(nums.goalCpa) || null,
      goal_conversions_month: num(nums.goalConv) || null,
      goal_roas: num(nums.goalRoas) || null,
      meta_tax_pct: num(nums.metaTax) ?? 0,
      google_tax_pct: num(nums.googleTax) ?? 0,
      name: name.trim(),
      owner_name: owner.trim() || null,
      logo_url: logo.trim() || null,
      emails: [...new Set(emailList)],
      whatsapp_numbers: [...new Set(phoneList)],
      timezone,
      active,
      updated_at: new Date().toISOString(),
    };
    const res = client
      ? await supabase.from("clients").update(payload).eq("id", client.id).select("id").single()
      : await supabase.from("clients").insert(payload).select("id").single();
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Não foi possível salvar.");
    onSaved(res.data.id);
  }

  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rpModalHead">
          <h2>{client ? "Editar cliente" : "Novo cliente"}</h2>
          <button className="iconButton" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="rpTwo">
          <label className="rpField">
            <span>Nome do cliente</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Distribuidora São João" autoFocus />
          </label>
          <label className="rpField">
            <span>Responsável</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Quem recebe os relatórios" />
          </label>
        </div>
        <label className="rpField">
          <span>Logo (link https, opcional)</span>
          <input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" />
        </label>
        <div className="rpTwo">
          <label className="rpField">
            <span>E-mails de destino</span>
            <textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"um por linha\nfinanceiro@cliente.com.br"} />
          </label>
          <label className="rpField">
            <span>WhatsApp de destino</span>
            <textarea value={phones} onChange={(e) => setPhones(e.target.value)} placeholder={"um por linha\n11 98765-4321"} />
            <small>Números do Brasil podem ser digitados só com DDD.</small>
          </label>
        </div>
        <div className="rpTwo">
          <label className="rpField">
            <span>Fuso horário</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="rpCheck" style={{ alignSelf: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Cliente ativo (recebe relatórios)
          </label>
        </div>
        <h3 className="rpFormGroup">Metas e verba mensal</h3>
        <p className="rpFormHint">Usadas para mostrar no relatório se o resultado está dentro, perto ou fora do combinado. Deixe em branco o que não se aplica.</p>
        <div className="rpFour">
          <label className="rpField">
            <span>Verba do mês (R$)</span>
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="15.000" />
          </label>
          <label className="rpField">
            <span>Conversões por mês</span>
            <input inputMode="decimal" value={goalConv} onChange={(e) => setGoalConv(e.target.value)} placeholder="400" />
          </label>
          <label className="rpField">
            <span>Custo por conversão até (R$)</span>
            <input inputMode="decimal" value={goalCpa} onChange={(e) => setGoalCpa(e.target.value)} placeholder="35,00" />
          </label>
          <label className="rpField">
            <span>ROAS mínimo</span>
            <input inputMode="decimal" value={goalRoas} onChange={(e) => setGoalRoas(e.target.value)} placeholder="3" />
          </label>
        </div>
        <h3 className="rpFormGroup">Impostos sobre a mídia</h3>
        <p className="rpFormHint">As plataformas mostram o gasto sem impostos. Informe o percentual da fatura para o relatório mostrar também o valor com impostos.</p>
        <div className="rpFour">
          <label className="rpField">
            <span>Meta Ads (%)</span>
            <input inputMode="decimal" value={metaTax} onChange={(e) => setMetaTax(e.target.value)} placeholder="0" />
          </label>
          <label className="rpField">
            <span>Google Ads (%)</span>
            <input inputMode="decimal" value={googleTax} onChange={(e) => setGoogleTax(e.target.value)} placeholder="0" />
          </label>
        </div>
        {error && <p className="rpError">{error}</p>}
        <div className="rpModalFoot">
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="button" disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
