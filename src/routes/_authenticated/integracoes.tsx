import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";
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
  const missing = providers.filter((p) => !p.connected);
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

      <div className="intList">
        {status.isLoading && (
          <>
            <div className="intSkeleton" />
            <div className="intSkeleton" />
          </>
        )}
        {connected.map((p) => (
          <ProviderCard key={p.provider} status={p} accounts={(accounts.data ?? []).filter((a) => a.provider === p.provider)} />
        ))}
        {missing.map((p) => (
          <div key={p.provider} className="intMissing">
            <span>{PROVIDER_NAME[p.provider]} não está conectado à plataforma.</span>
            <button className="intLink" type="button" onClick={() => connectProvider(p.provider).catch((e: Error) => toast.error(e.message))}>
              Conectar {PROVIDER_NAME[p.provider]}
            </button>
          </div>
        ))}
      </div>

      <section className="intSection">
        <h2>Próximas integrações</h2>
        <p>Canais de envio automático dos relatórios. Ficam ativos quando as chaves forem cadastradas.</p>
        <div className="intFuture">
          <div className="intFutureItem">
            <Mail size={20} />
            <div>
              <strong>E-mail</strong>
              <p>Relatório com resumo no corpo do e-mail, PDF anexado e link do painel ao vivo.</p>
            </div>
            <span className={"intTag" + (status.data?.channels.email ? " ready" : "")}>{status.data?.channels.email ? "Pronto para usar" : "Em breve"}</span>
          </div>
          <div className="intFutureItem">
            <MessageCircle size={20} />
            <div>
              <strong>WhatsApp</strong>
              <p>Envio do PDF e do link do painel para o número ou grupo de cada cliente.</p>
            </div>
            <span className={"intTag" + (status.data?.channels.whatsapp ? " ready" : "")}>{status.data?.channels.whatsapp ? "Pronto para usar" : "Em breve"}</span>
          </div>
        </div>
      </section>
    </AgencyShell>
  );
}

function ProviderCard({ status: p, accounts }: { status: ProviderStatus; accounts: AccountRow[] }) {
  const [query, setQuery] = useState("");
  const expiresSoon = p.provider === "meta" && p.expiresAt && Date.parse(p.expiresAt) - Date.now() < 10 * 86_400_000;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    return accounts.filter((a) => !q || a.name.toLowerCase().includes(q) || a.account_id.replace(/-/g, "").includes(q) || a.clients.some((c) => c.name.toLowerCase().includes(q)));
  }, [accounts, query]);
  const linked = accounts.filter((a) => a.clients.length).length;

  return (
    <article className="intCard">
      <div className="intTop">
        <div className="intId">
          <div className="intName">
            <span className={"intDot " + p.provider} />
            {PROVIDER_NAME[p.provider]}
          </div>
          <div className="intAsset">
            <strong>{p.asset.name ?? `${ASSET_LABEL[p.provider]} da agência`}</strong>
            {ASSET_LABEL[p.provider]} {p.asset.id}
          </div>
          <span className={"intOk" + (expiresSoon ? " intWarn" : "")}>{expiresSoon ? "Conectado · renovar em breve" : "Conectado"}</span>
        </div>
        <dl className="intFacts">
          <div>
            <dt>{p.provider === "meta" ? "Perfil do Facebook vinculado" : "Conta Google vinculada"}</dt>
            <dd>
              {p.profile ?? "Não identificado"}
              {(p.profileHint || !p.profile) && <small>{p.profileHint ?? "Não foi possível consultar o perfil agora."}</small>}
            </dd>
          </div>
          <div>
            <dt>Conectado na plataforma por</dt>
            <dd>
              {p.connectedBy ?? "—"}
              <small>em {fmtDate(p.authorizedAt)}</small>
            </dd>
          </div>
          <div>
            <dt>Contas de anúncio</dt>
            <dd>
              {int(p.accounts)} disponíveis
              <small>
                {int(linked)} vinculadas a clientes · atualizado {fmtDate(p.lastSync)}
              </small>
            </dd>
          </div>
          {p.provider === "meta" && (
            <div>
              <dt>Autorização válida até</dt>
              <dd>
                {fmtDate(p.expiresAt, false)}
                <small>A Meta pede nova autorização a cada 60 dias</small>
              </dd>
            </div>
          )}
        </dl>
        <div className="intActions">
          <button className={"intLink" + (expiresSoon ? "" : " muted")} type="button" onClick={() => connectProvider(p.provider).catch((e: Error) => toast.error(e.message))}>
            Reconectar
          </button>
        </div>
      </div>
      <details className="intAccounts">
        <summary>
          Contas da {ASSET_LABEL[p.provider] === "MCC" ? "MCC" : "BM"} <span>{int(accounts.length)} contas · ver lista</span>
        </summary>
        {accounts.length === 0 ? (
          <p className="intSearch">Nenhuma conta importada ainda. Use “Atualizar contas” no topo da página.</p>
        ) : (
          <>
            <div className="intSearch">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por conta, ID ou cliente" aria-label="Buscar contas" />
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
                  {rows.slice(0, 300).map((a) => (
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
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </article>
  );
}
