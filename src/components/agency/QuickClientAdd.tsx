import { useState } from "react";
import { PlatformMark } from "./PlatformMark";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agencyApi } from "@/lib/agency-client";

type Platform = "google" | "meta";
type Found = { provider: Platform; account_id: string; name: string; currency: string | null; linkedTo: { id: string; name: string } | null };
type Lookup = { provider: Platform; source: "conta" | "bm"; title: string | null; accounts: Found[]; byName?: boolean };

const HINT: Record<Platform, { label: string; placeholder: string; help: string }> = {
  google: { label: "Nome ou número da conta Google Ads", placeholder: "Ex.: Porto Vistorias ou 123-456-7890", help: "Digite parte do nome da conta ou o número de 10 dígitos do topo do Google Ads." },
  meta: { label: "Nome, ID da BM ou da conta de anúncios", placeholder: "Ex.: Porto Vistorias ou 1914217738639420", help: "Digite parte do nome da conta, o ID da BM ou o ID da conta de anúncios." },
};
/** Account name without the agency's "C.A - " prefix, as a client name. */
const cleanName = (n: string) => n.trim().replace(/^C\.?\s?A\.?\s*(-\s*)?/i, "").replace(/\s*\(reserva[^)]*\)\s*$/i, "").trim() || n.trim();
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

  async function searchByName(q: string) {
    const term = q.replace(/[%_,()]/g, " ").trim();
    const { data, error: e } = await supabase.from("ad_accounts_catalog").select("account_id,name,currency").eq("provider", platform).ilike("name", `%${term}%`).order("name").limit(30);
    if (e) throw new Error(e.message);
    const rows = (data ?? []) as Array<{ account_id: string; name: string; currency: string | null }>;
    if (!rows.length) throw new Error(`Nenhuma conta ${platform === "google" ? "Google Ads" : "Meta Ads"} com “${q.trim()}” no nome. Confira a grafia ou clique em “Atualizar contas” em Integrações.`);
    const { data: links } = await supabase.from("client_ad_accounts").select("account_id,client_id,clients(name)").eq("provider", platform).in("account_id", rows.map((r) => r.account_id));
    const linked = new Map(((links ?? []) as unknown as Array<{ account_id: string; client_id: string; clients: { name: string } | null }>).map((l) => [l.account_id, { id: l.client_id, name: l.clients?.name ?? "cliente" }]));
    const accounts: Found[] = rows.map((r) => ({ provider: platform, account_id: r.account_id, name: r.name, currency: r.currency, linkedTo: linked.get(r.account_id) ?? null }));
    return { provider: platform, source: "conta" as const, title: null, accounts, byName: true };
  }

  async function lookup() {
    if (!id.trim()) return;
    setBusy("lookup");
    setError("");
    setResult(null);
    try {
      // Letters → search the synced accounts by name; digits → Google number / Meta BM or account ID.
      if (/[a-zà-ú]/i.test(id.replace(/^act_/i, ""))) {
        const r = await searchByName(id);
        const free = r.accounts.filter((a) => !a.linkedTo);
        setResult(r);
        setPicked(free.length === 1 ? [free[0]!.account_id] : []);
        setName(cleanName((free[0] ?? r.accounts[0])!.name));
        return;
      }
      const r = await agencyApi<Lookup>("/api/integrations/client-lookup?" + new URLSearchParams({ provider: platform, id: id.trim() }).toString());
      setResult(r);
      setPicked(r.accounts.filter((a) => !a.linkedTo).map((a) => a.account_id));
      setName(cleanName(r.title ?? r.accounts[0]?.name ?? ""));
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

  const toggle = (acc: string) =>
    setPicked((cur) => {
      const next = cur.includes(acc) ? cur.filter((x) => x !== acc) : [...cur, acc];
      // Suggest the client name from the first account picked in a name search.
      if (result?.byName && next.length === 1 && cur.length === 0) setName(cleanName(result.accounts.find((a) => a.account_id === acc)?.name ?? name));
      return next;
    });

  return (
    <section className="panel qcBox" aria-label="Cadastrar cliente pela conta">
      <div className="qcHead">
        <span className="qcIcon">
          <UserPlus size={18} />
        </span>
        <div>
          <h2>Cadastrar cliente pela conta</h2>
          <p>Digite o nome da conta, o número da conta do Google ou o ID da BM da Meta. Buscamos as contas e o nome automaticamente.</p>
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
          <input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void lookup()} placeholder={HINT[platform].placeholder} inputMode="text" />
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
            {result.byName
              ? `${result.accounts.length} conta${result.accounts.length === 1 ? "" : "s"} com “${id.trim()}” no nome · marque as que são deste cliente`
              : result.source === "bm"
                ? `BM ${result.title ?? ""} · ${result.accounts.length} conta${result.accounts.length === 1 ? "" : "s"} encontrada${result.accounts.length === 1 ? "" : "s"}`
                : "Conta encontrada"}
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
                    {a.linkedTo ? ` · já é do cliente ${a.linkedTo.name}` : ""}
                  </small>
                </span>
                {a.linkedTo && (
                  <button type="button" className="textLink qcOpen" onClick={() => onCreated(a.linkedTo!.id)}>
                    Abrir cliente
                  </button>
                )}
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
