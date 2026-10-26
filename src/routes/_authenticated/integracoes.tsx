import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, KeyRound, Link2, Mail, MessageCircle, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";
import { AgencyShell } from "@/components/agency/AgencyShell";
import { agencyApi, connectProvider } from "@/lib/agency-client";

export const Route = createFileRoute("/_authenticated/integracoes")({ component: IntegrationsPage });

type Status = {
  providers: Array<{ provider: "meta" | "google"; connected: boolean; expiresAt: string | null; authorizedAt: string | null; accounts: number; lastSync: string | null }>;
  config: { googleDeveloperToken: boolean; appOrigin: boolean; email: boolean; whatsapp: boolean; whatsappProvider: string; cron: boolean };
};
type SyncResult = { syncedAt: string; result: Record<"meta" | "google", { count: number; error: string | null }> };

const LABEL = {
  meta: { name: "Meta Ads", sub: "Business Manager 1914217738639420" },
  google: { name: "Google Ads", sub: "MCC 226-294-0733" },
} as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function IntegrationsPage() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState<"meta" | "google" | null>(null);
  const status = useQuery({ queryKey: ["integrations-status"], queryFn: () => agencyApi<Status>("/api/integrations/status") });
  const sync = useMutation({
    mutationFn: () => agencyApi<SyncResult>("/api/integrations/sync-accounts", { method: "POST", body: {} }),
    onSuccess: (r) => {
      for (const p of ["meta", "google"] as const) {
        const item = r.result[p];
        if (item.error) toast.error(`${LABEL[p].name}: ${item.error}`);
        else toast.success(`${LABEL[p].name}: ${item.count} contas sincronizadas`);
      }
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      qc.invalidateQueries({ queryKey: ["ad-accounts-catalog"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização"),
  });

  return (
    <AgencyShell
      eyebrow="CONEXÕES DA AGÊNCIA"
      title="Integrações"
      description="Conecte a BM e a MCC da agência e sincronize as contas de anúncio que poderão ser vinculadas aos clientes."
      actions={
        <button className="primary" type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw size={16} className={sync.isPending ? "animate-spin" : ""} /> {sync.isPending ? "Sincronizando…" : "Sincronizar contas"}
        </button>
      }
    >
      {status.isError && <section className="panel rpEmpty"><p className="rpError">{(status.error as Error).message}</p></section>}
      <div className="rpTwo" style={{ marginBottom: 16 }}>
        {(["meta", "google"] as const).map((p) => {
          const s = status.data?.providers.find((x) => x.provider === p);
          return (
            <section key={p} className="panel rpCard">
              <h2>
                <Link2 size={18} /> {LABEL[p].name}
              </h2>
              <p className="rpHint">{LABEL[p].sub}</p>
              <div className="rpRow">
                <span>Status</span>
                {status.isLoading ? <span className="rpBadge">Verificando…</span> : s?.connected ? <span className="rpBadge ok"><CheckCircle2 size={12} /> Conectado</span> : <span className="rpBadge bad">Não conectado</span>}
              </div>
              <div className="rpRow"><span>Autorizado em</span><strong>{when(s?.authorizedAt ?? null)}</strong></div>
              {p === "meta" && <div className="rpRow"><span>Autorização expira em</span><strong>{when(s?.expiresAt ?? null)}</strong></div>}
              <div className="rpRow"><span>Contas no catálogo</span><strong>{s?.accounts ?? 0}</strong></div>
              <div className="rpRow"><span>Última sincronização</span><strong>{when(s?.lastSync ?? null)}</strong></div>
              <div className="rpRow">
                <span />
                <button
                  className="secondary"
                  type="button"
                  disabled={connecting !== null}
                  onClick={async () => {
                    setConnecting(p);
                    try {
                      await connectProvider(p);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Não foi possível conectar.");
                      setConnecting(null);
                    }
                  }}
                >
                  {connecting === p ? "Abrindo…" : s?.connected ? "Reconectar" : "Conectar"}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel rpCard">
        <h2>
          <KeyRound size={18} /> Configuração de envio
        </h2>
        <p className="rpHint">Valores ficam nos Secrets do projeto (Lovable Cloud). Aqui só mostramos se estão preenchidos.</p>
        <ConfigRow icon={<KeyRound size={15} />} label="Developer token do Google Ads (opcional)" ok={status.data?.config.googleDeveloperToken} optional hint="Desde set/2026 o acesso à API vem do projeto no Google Cloud; o token não é mais exigido." />
        <ConfigRow icon={<Link2 size={15} />} label="Endereço público do app" ok={status.data?.config.appOrigin} hint="APP_ORIGIN" />
        <ConfigRow icon={<Mail size={15} />} label="E-mail (Resend)" ok={status.data?.config.email} hint="RESEND_API_KEY, REPORT_EMAIL_FROM" />
        <ConfigRow
          icon={<MessageCircle size={15} />}
          label={`WhatsApp (${status.data?.config.whatsappProvider === "zapi" ? "Z-API" : "API oficial da Meta"})`}
          ok={status.data?.config.whatsapp}
          hint={status.data?.config.whatsappProvider === "zapi" ? "ZAPI_INSTANCE_ID, ZAPI_TOKEN" : "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME"}
        />
        <ConfigRow icon={<Timer size={15} />} label="Senha do agendador automático" ok={status.data?.config.cron} hint="LOVABLE_CRON_SECRET. Também é preciso um serviço chamando /api/cron/reports a cada 15 min." />
      </section>
    </AgencyShell>
  );
}

function ConfigRow({ icon, label, ok, hint, optional }: { icon: React.ReactNode; label: string; ok: boolean | undefined; hint: string; optional?: boolean }) {
  return (
    <div className="rpRow">
      <div className="rpRowMain">
        <strong style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {icon} {label}
        </strong>
        <small>{hint}</small>
      </div>
      {ok === undefined ? <span className="rpBadge">—</span> : ok ? <span className="rpBadge ok">Configurado</span> : optional ? <span className="rpBadge">Não necessário</span> : <span className="rpBadge warn">Pendente</span>}
    </div>
  );
}
