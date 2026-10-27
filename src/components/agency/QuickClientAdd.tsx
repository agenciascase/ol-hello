import { useState } from "react";
import { PlatformMark } from "./PlatformMark";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agencyApi } from "@/lib/agency-client";

type Platform = "google" | "meta";
type Found = { provider: Platform; account_id: string; name: string; currency: string | null; linkedTo: { id: string; name: string } | null };
type Lookup = { provider: Platform; source: "conta" | "bm"; title: string | null; accounts: Found[] };

const HINT: Record<Platform, { label: string; placeholder: string; help: string }> = {
  google: { label: "Número da conta Google Ads", placeholder: "Ex.: 123-456-7890", help: "O número de 10 dígitos que aparece no topo do Google Ads do cliente." },
  meta: { label: "ID da BM ou da conta de anúncios", placeholder: "Ex.: 1914217738639420", help: "Em Configurações do negócio › Informações da empresa (BM) ou no Gerenciador de Anúncios (conta)." },
};
const fmt = (p: Platform, id: string) => (p === "google" ? id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : id.replace(/^act_/, ""));

/** One-step client registration from a Google Ads account number or a Meta BM / ad account ID. */
export function QuickClientAdd({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<Platform>("google");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState<"" | "lookup" | "save">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");

  async function lookup() {
    if (!id.trim()) return;
    setBusy("lookup");
    setError("");
    setResult(null);
    try {
      const r = await agencyApi<Lookup>("/api/integrations/client-lookup?" + new URLSearchParams({ provider: platform, id: id.trim() }).toString());
      setResult(r);
      setPicked(r.accounts.filter((a) => !a.linkedTo).map((a) => a.account_id));
      setName(r.title ?? r.accounts[0]?.name ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar.");
    } finally {
      setBusy("");
    }
  }

  async function create() {
    if (!result || !name.trim() || !picked.length) return;
    setBusy("save");
    setError("");
    const { data, error: e1 } = await supabase.from("clients").insert({ name: name.trim().slice(0, 200) }).select("id").single();
    if (e1 || !data) {
      setBusy("");
      return setError(e1?.message ?? "Não foi possível cadastrar o cliente.");
    }
    const rows = result.accounts.filter((a) => picked.includes(a.account_id)).map((a) => ({ client_id: data.id, provider: a.provider, account_id: a.account_id, account_name: a.name }));
    const { error: e2 } = await supabase.from("client_ad_accounts").insert(rows);
    setBusy("");
    if (e2) return setError("Cliente criado, mas as contas não foram vinculadas: " + e2.message);
    await qc.invalidateQueries({ queryKey: ["clients"] });
    onCreated(data.id);
  }

  const toggle = (acc: string) => setPicked((cur) => (cur.includes(acc) ? cur.filter((x) => x !== acc) : [...cur, acc]));

  return (
    <section className="panel qcBox" aria-label="Cadastrar cliente pela conta">
      <div className="qcHead">
        <span className="qcIcon">
          <UserPlus size={18} />
        </span>
        <div>
          <h2>Cadastrar cliente pela conta</h2>
          <p>Digite o número da conta do Google ou o ID da BM da Meta. Buscamos as contas e o nome automaticamente.</p>
        </div>
      </div>

      <div className="qcForm">
        <div className="qcSeg" role="tablist" aria-label="Plataforma">
          {(["google", "meta"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              className={"qcSegBtn " + p}
              onClick={() => {
                setPlatform(p);
                setResult(null);
                setError("");
              }}
            >
              <PlatformMark platform={p} />
              {p === "google" ? "Google Ads" : "Meta Ads"}
            </button>
          ))}
        </div>
        <label className="qcField">
          <span>{HINT[platform].label}</span>
          <input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void lookup()} placeholder={HINT[platform].placeholder} inputMode="numeric" />
          <small>{HINT[platform].help}</small>
        </label>
        <button type="button" className="primary qcGo" disabled={!id.trim() || busy !== ""} onClick={() => void lookup()}>
          {busy === "lookup" ? <Loader2 size={16} className="qcSpin" /> : <Search size={16} />} Buscar
        </button>
      </div>

      {error && <p className="rpError qcError">{error}</p>}

      {result && (
        <div className="qcResult">
          <p className="qcFound">
            {result.source === "bm" ? `BM ${result.title ?? ""} · ${result.accounts.length} conta${result.accounts.length === 1 ? "" : "s"} encontrada${result.accounts.length === 1 ? "" : "s"}` : "Conta encontrada"}
          </p>
          <div className="qcAccounts">
            {result.accounts.map((a) => (
              <label key={a.account_id} className={"qcAcc" + (a.linkedTo ? " taken" : "")}>
                <input type="checkbox" disabled={Boolean(a.linkedTo)} checked={picked.includes(a.account_id)} onChange={() => toggle(a.account_id)} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {fmt(a.provider, a.account_id)}
                    {a.currency ? " · " + a.currency : ""}
                    {a.linkedTo ? ` · já vinculada a ${a.linkedTo.name}` : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="qcSave">
            <label className="qcField">
              <span>Nome do cliente</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </label>
            <button type="button" className="primary" disabled={!name.trim() || !picked.length || busy !== ""} onClick={() => void create()}>
              {busy === "save" ? <Loader2 size={16} className="qcSpin" /> : <Check size={16} />} Cadastrar cliente
            </button>
          </div>
          {result.accounts.every((a) => a.linkedTo) && <small className="qcNote">Todas as contas já estão vinculadas a um cliente.</small>}
        </div>
      )}
    </section>
  );
}
