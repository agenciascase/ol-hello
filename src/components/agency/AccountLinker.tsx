import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CatalogRow = { provider: "meta" | "google"; account_id: string; name: string; currency: string | null; status: string | null };

/** Picks ad accounts from the synced BM/MCC catalogue and links them to a client. */
export function AccountLinker({ clientId, linked, onClose, onSaved }: { clientId: string; linked: Array<{ provider: string; account_id: string }>; onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState<"all" | "meta" | "google">("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CatalogRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const catalog = useQuery({
    queryKey: ["ad-accounts-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_accounts_catalog").select("provider,account_id,name,currency,status").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as CatalogRow[];
    },
  });

  const isLinked = (r: CatalogRow) => linked.some((l) => l.provider === r.provider && l.account_id === r.account_id);
  const isPicked = (r: CatalogRow) => picked.some((p) => p.provider === r.provider && p.account_id === r.account_id);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    return (catalog.data ?? [])
      .filter((r) => provider === "all" || r.provider === provider)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.account_id.toLowerCase().replace(/-/g, "").includes(q))
      .slice(0, 150);
  }, [catalog.data, provider, query]);

  async function save() {
    if (!picked.length) return onClose();
    setSaving(true);
    setError("");
    const { error } = await supabase
      .from("client_ad_accounts")
      .upsert(picked.map((p) => ({ client_id: clientId, provider: p.provider, account_id: p.account_id, account_name: p.name })), { onConflict: "client_id,provider,account_id", ignoreDuplicates: true });
    setSaving(false);
    if (error) return setError(error.message);
    onSaved();
  }

  const formatId = (r: CatalogRow) => (r.provider === "google" ? r.account_id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : r.account_id.replace(/^act_/, ""));

  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rpModalHead">
          <h2>Vincular contas de anúncio</h2>
          <button className="iconButton" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="rpToolbar">
          <label className="searchBox rpSearch">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou ID da conta" autoFocus />
          </label>
          <div className="periods">
            {(
              [
                ["all", "Todas"],
                ["meta", "Meta"],
                ["google", "Google"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={provider === v ? "chosen" : ""} onClick={() => setProvider(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {catalog.isLoading ? (
          <p>Carregando catálogo…</p>
        ) : !catalog.data?.length ? (
          <div className="rpEmpty">
            <strong>O catálogo está vazio.</strong>
            <p>
              Sincronize as contas da BM e da MCC em <Link to="/integracoes">Integrações</Link> primeiro.
            </p>
          </div>
        ) : (
          <div className="rpList" style={{ maxHeight: 380, overflow: "auto" }}>
            {rows.map((r) => {
              const already = isLinked(r);
              return (
                <label key={r.provider + r.account_id} className="rpRow" style={{ cursor: already ? "default" : "pointer", opacity: already ? 0.55 : 1 }}>
                  <span className="rpCheck">
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={already || isPicked(r)}
                      onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, r] : cur.filter((p) => !(p.provider === r.provider && p.account_id === r.account_id))))}
                    />
                    <span className="rpRowMain">
                      <strong>{r.name}</strong>
                      <small>
                        {formatId(r)}
                        {r.currency ? " · " + r.currency : ""}
                        {r.status && r.status !== "ACTIVE" && r.status !== "ENABLED" ? " · " + r.status : ""}
                      </small>
                    </span>
                  </span>
                  <span className={"network " + r.provider}>{r.provider === "meta" ? "Meta" : "Google"}</span>
                </label>
              );
            })}
            {rows.length === 150 && <small style={{ padding: 10, color: "var(--muted)" }}>Mostrando as primeiras 150 contas. Refine a busca.</small>}
          </div>
        )}
        {error && <p className="rpError">{error}</p>}
        <div className="rpModalFoot">
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="button" disabled={saving || !picked.length} onClick={save}>
            {saving ? "Vinculando…" : `Vincular ${picked.length || ""} conta${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
