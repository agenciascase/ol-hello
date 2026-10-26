import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { agencyApi } from "@/lib/agency-client";

export type ProviderStatus = {
  provider: "meta" | "google";
  connected: boolean;
  expiresAt: string | null;
  authorizedAt: string | null;
  accounts: number;
  lastSync: string | null;
  connectedBy: string | null;
  profile: string | null;
  profileHint: string | null;
  asset: { id: string; name: string | null };
};
export type ChannelState = { connected: boolean; source: "plataforma" | "secrets" | null; info: Record<string, string>; updatedAt: string | null };
export type IntegrationStatus = {
  providers: ProviderStatus[];
  channels: Record<"email" | "whatsapp", ChannelState>;
};

export const PROVIDER_NAME = { meta: "Meta Ads", google: "Google Ads" } as const;
export const ASSET_LABEL = { meta: "Business Manager", google: "MCC" } as const;

export const fmtDate = (iso: string | null, withTime = true) =>
  iso ? new Date(iso).toLocaleString("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) : "—";

export function useIntegrationStatus() {
  return useQuery({ queryKey: ["integrations-status"], queryFn: () => agencyApi<IntegrationStatus>("/api/integrations/status"), staleTime: 60_000 });
}

/** Short version for the classic dashboard settings: only what is connected, plus the future channels. */
export function IntegrationsCompact() {
  const q = useIntegrationStatus();
  const connected = q.data?.providers.filter((p) => p.connected) ?? [];
  return (
    <div className="intCompact">
      {q.isLoading && <div className="row">Verificando conexões…</div>}
      {q.isError && <div className="row">{(q.error as Error).message}</div>}
      {connected.map((p) => (
        <div className="row" key={p.provider}>
          <div>
            <strong>
              {PROVIDER_NAME[p.provider]} · {ASSET_LABEL[p.provider]} {p.asset.name ?? p.asset.id}
            </strong>
            <small>{p.profile ? `Perfil: ${p.profile}` : p.connectedBy ? `Conectado por ${p.connectedBy}` : `${p.accounts} contas`}</small>
          </div>
          <span className="chip ok">Conectado</span>
        </div>
      ))}
      {q.data && (
        <>
          <div className="row">
            <div>
              <strong>E-mail</strong>
              <small>Envio automático dos relatórios por e-mail</small>
            </div>
            <span className={"chip" + (q.data.channels.email.connected ? " ok" : "")}>{q.data.channels.email.connected ? "Conectado" : "Não conectado"}</span>
          </div>
          <div className="row">
            <div>
              <strong>WhatsApp</strong>
              <small>Envio automático dos relatórios aos clientes e grupos</small>
            </div>
            <span className={"chip" + (q.data.channels.whatsapp.connected ? " ok" : "")}>{q.data.channels.whatsapp.connected ? "Conectado" : "Não conectado"}</span>
          </div>
        </>
      )}
      <Link to="/integracoes" className="more">
        Ver perfis e contas vinculadas
      </Link>
    </div>
  );
}
