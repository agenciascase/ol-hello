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
};

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
    setSaving(true);
    const payload = {
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
