import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Megaphone, RefreshCw, Search, X } from "lucide-react";
import { IntegrationCard } from "@/components/agency/IntegrationCard";
import { DeliveryChannels } from "@/components/agency/ChannelConnect";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AgencyShell } from "@/components/agency/AgencyShell";
import { ASSET_LABEL, PROVIDER_NAME, fmtDate, useIntegrationStatus, type ProviderStatus } from "@/components/agency/IntegrationsOverview";
import { agencyApi, connectProvider } from "@/lib/agency-client";

export const Route = createFileRoute("/_authenticated/integracoes")({ component: IntegrationsPage });

type SyncResult = { syncedAt: string; result: Record<"meta" | "google", { count: number; error: string | null }> };
type AccountRow = { provider: "meta" | "google"; account_id: string; name: string; currency: string | null; status: string | null; clients: Array<{ id: string; name: string }> };

const fmtId = (provider: string, id: string) => (provider === "google" ? id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : id.replace(/^act_/, ""));
const int = (n: number) => n.toLocaleString("pt-BR");

function useAccounts() {
  return useQuery({
    queryKey: ["ad-accounts-catalog-with-clients"],
    queryFn: async () => {
      const [catalog, links] = await Promise.all([
        supabase.from("ad_accounts_catalog").select("provider,account_id,name,currency,status").order("name"),
        supabase.from("client_ad_accounts").select("provider,account_id,client_id,clients(name)"),
      ]);
      if (catalog.error) throw new Error(catalog.error.message);
      const byKey = new Map<string, Array<{ id: string; name: string }>>();
      for (const l of (links.data ?? []) as unknown as Array<{ provider: string; account_id: string; client_id: string; clients: { name: string } | null }>) {
        const k = l.provider + "|" + l.account_id;
        byKey.set(k, [...(byKey.get(k) ?? []), { id: l.client_id, name: l.clients?.name ?? "Cliente" }]);
      }
      return (catalog.data ?? []).map((a) => ({ ...a, clients: byKey.get(a.provider + "|" + a.account_id) ?? [] })) as AccountRow[];
    },
  });
}

function IntegrationsPage() {
  const qc = useQueryClient();
  const status = useIntegrationStatus();
  const accounts = useAccounts();
  const sync = useMutation({
    mutationFn: () => agencyApi<SyncResult>("/api/integrations/sync-accounts", { method: "POST", body: {} }),
    onSuccess: (r) => {
      for (const p of ["meta", "google"] as const) {
        const item = r.result[p];
        if (item.error) toast.error(`${PROVIDER_NAME[p]}: ${item.error}`);
        else toast.success(`${PROVIDER_NAME[p]}: ${int(item.count)} contas atualizadas`);
      }
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      qc.invalidateQueries({ queryKey: ["ad-accounts-catalog-with-clients"] });
      qc.invalidateQueries({ queryKey: ["ad-accounts-catalog"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização"),
  });

  const providers = status.data?.providers ?? [];
  const connected = providers.filter((p) => p.connected);
  const linkedAccounts = (accounts.data ?? []).filter((a) => a.clients.length > 0).length;
  const lastSync = providers.reduce<string | null>((m, p) => (p.lastSync && (!m || p.lastSync > m) ? p.lastSync : m), null);

  return (
    <AgencyShell
      title="Integrações"
      description="As contas que alimentam os relatórios dos clientes e os perfis por onde a agência está conectada."
      actions={
        connected.length > 0 && (
          <button className="primary" type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw size={16} className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Atualizando contas…" : "Atualizar contas"}
          </button>
        )
      }
      stats={
        status.data
          ? [
              { value: `${connected.length} de 2`, label: "plataformas conectadas" },
              ...connected.map((p) => ({ value: int(p.accounts), label: `contas ${PROVIDER_NAME[p.provider]}` })),
              { value: int(linkedAccounts), label: "contas vinculadas a clientes" },
              { value: lastSync ? fmtDate(lastSync) : "—", label: "última atualização" },
            ]
          : []
      }
    >
      {status.isError && <section className="agEmpty">{(status.error as Error).message}</section>}

      <section className="intSection first">
        <h2>Plataformas de anúncio</h2>
        <p>Contas de onde vêm os números dos relatórios.</p>
        <div className="intGrid">
          {status.isLoading && (
            <>
              <div className="intSkeleton" />
              <div className="intSkeleton" />
            </>
          )}
          {providers.map((p) => (
            <ProviderCard key={p.provider} status={p} accounts={(accounts.data ?? []).filter((a) => a.provider === p.provider)} />
          ))}
        </div>
      </section>

      <DeliveryChannels channels={status.data?.channels} />
    </AgencyShell>
  );
}

function ProviderCard({ status: p, accounts }: { status: ProviderStatus; accounts: AccountRow[] }) {
  const [showAccounts, setShowAccounts] = useState(false);
  const expiresSoon = p.connected && p.provider === "meta" && p.expiresAt !== null && Date.parse(p.expiresAt) - Date.now() < 10 * 86_400_000;
  const linked = accounts.filter((a) => a.clients.length).length;
  const connect = () => connectProvider(p.provider).catch((e: Error) => toast.error(e.message));
  const asset = `${ASSET_LABEL[p.provider]} ${p.asset.id}`;
  return (
    <>
      <IntegrationCard
        icon={p.provider === "meta" ? <Megaphone size={19} /> : <Search size={19} />}
        tone={p.provider}
        name={PROVIDER_NAME[p.provider]}
        subtitle={p.asset.name ? `${p.asset.name} · ${asset}` : asset}
        connected={p.connected}
        warn={expiresSoon}
        statusLabel={expiresSoon ? "Renovar em breve" : undefined}
        description={p.connected ? undefined : `Conecte o ${ASSET_LABEL[p.provider]} da agência para usar as contas de ${PROVIDER_NAME[p.provider]} nos relatórios.`}
        lines={
          p.connected
            ? [
                {
                  label: p.provider === "meta" ? "Perfil do Facebook" : "Conta Google",
                  value: p.profile ?? "Não identificado",
                  hint: p.profileHint ?? (p.profile ? undefined : "Não foi possível consultar o perfil agora."),
                },
                { label: "Conectado por", value: p.connectedBy ?? "—", hint: `em ${fmtDate(p.authorizedAt)}` },
                { label: "Contas de anúncio", value: `${int(p.accounts)} disponíveis`, hint: `${int(linked)} vinculadas a clientes` },
                ...(p.provider === "meta" ? [{ label: "Autorização válida até", value: fmtDate(p.expiresAt, false), hint: "Renovada a cada 60 dias" }] : []),
              ]
            : []
        }
        actions={
          p.connected ? (
            <>
              <button type="button" className="intLink" onClick={() => setShowAccounts(true)}>
                Ver contas ({int(accounts.length)})
              </button>
              <button type="button" className={"intLink" + (expiresSoon ? "" : " muted")} onClick={connect}>
                Reconectar
              </button>
            </>
          ) : (
            <button type="button" className="intConnect" onClick={connect}>
              Conectar {PROVIDER_NAME[p.provider]}
            </button>
          )
        }
      />
      {showAccounts && <AccountsModal provider={p.provider} accounts={accounts} onClose={() => setShowAccounts(false)} />}
    </>
  );
}

function AccountsModal({ provider, accounts, onClose }: { provider: "meta" | "google"; accounts: AccountRow[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    return accounts
      .filter((a) => !onlyFree || a.clients.length === 0)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.account_id.replace(/-/g, "").includes(q) || a.clients.some((c) => c.name.toLowerCase().includes(q)));
  }, [accounts, query, onlyFree]);
  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal intAccountsModal" role="dialog" aria-modal="true" aria-label={`Contas ${PROVIDER_NAME[provider]}`} onClick={(e) => e.stopPropagation()}>
        <div className="rpModalHead">
          <h2>
            Contas {PROVIDER_NAME[provider]} <small>{int(accounts.length)}</small>
          </h2>
          <button className="iconButton" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {accounts.length === 0 ? (
          <p className="rpFormHint">Nenhuma conta importada ainda. Use “Atualizar contas” no topo da página.</p>
        ) : (
          <>
            <div className="intModalTools">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por conta, ID ou cliente" aria-label="Buscar contas" autoFocus />
              <label className="rpCheck">
                <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Só contas sem cliente
              </label>
            </div>
            <div className="intTableWrap">
              <table className="intTable">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>ID</th>
                    <th>Cliente na SCASE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((a) => (
                    <tr key={a.account_id}>
                      <td>{a.name}</td>
                      <td>{fmtId(a.provider, a.account_id)}</td>
                      <td>
                        {a.clients.length ? (
                          a.clients.map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && ", "}
                              <Link className="linked" to="/clientes/$clientId" params={{ clientId: c.id }}>
                                {c.name}
                              </Link>
                            </span>
                          ))
                        ) : (
                          <span className="free">Sem cliente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="free">
                        Nenhuma conta encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
