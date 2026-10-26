import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { agencyApi } from "@/lib/agency-client";
import { fmtDate, type ChannelState } from "./IntegrationsOverview";
import { IntegrationCard } from "./IntegrationCard";

type Channel = "email" | "whatsapp";
const META = {
  email: { name: "E-mail", icon: Mail, text: "Resumo no corpo do e-mail, PDF anexado e link do painel ao vivo." },
  whatsapp: { name: "WhatsApp", icon: MessageCircle, text: "PDF e link do painel no número ou grupo de cada cliente." },
} as const;

/** Bottom-of-page cards for the delivery channels, each with its own connect flow. */
export function DeliveryChannels({ channels }: { channels: Record<Channel, ChannelState> | undefined }) {
  const [open, setOpen] = useState<Channel | null>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations-status"] });

  async function disconnect(c: Channel) {
    if (!window.confirm(`Desconectar ${META[c].name}? Os relatórios deixam de ser enviados por este canal.`)) return;
    try {
      await agencyApi(`/api/integrations/channels/${c}`, { method: "POST", body: { action: "disconnect" } });
      toast.success(`${META[c].name} desconectado`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desconectar.");
    }
  }

  return (
    <section className="intSection">
      <h2>Canais de envio</h2>
      <p>Por onde os relatórios automáticos chegam aos clientes.</p>
      <div className="intGrid">
        {(["email", "whatsapp"] as Channel[]).map((c) => {
          const st = channels?.[c];
          const Icon = META[c].icon;
          const lines =
            st?.connected
              ? c === "email"
                ? [{ label: "Remetente", value: st.info["from"] ?? "—", hint: st.source === "secrets" ? "Configurado pelos Secrets do projeto" : st.updatedAt ? `Conectado em ${fmtDate(st.updatedAt)}` : undefined }]
                : [
                    { label: "Envio por", value: st.info["provider"] ?? "—", hint: st.info["template"] ? `Modelo ${st.info["template"]}` : undefined },
                    ...(st.info["number"] ? [{ label: "Número", value: st.info["number"] }] : []),
                    ...(st.updatedAt ? [{ label: "Conectado em", value: fmtDate(st.updatedAt) }] : st.source === "secrets" ? [{ label: "Origem", value: "Secrets do projeto" }] : []),
                  ]
              : [];
          return (
            <IntegrationCard
              key={c}
              icon={<Icon size={19} />}
              tone="channel"
              name={META[c].name}
              subtitle={c === "email" ? "Resend" : "API oficial da Meta ou Z-API"}
              connected={Boolean(st?.connected)}
              description={st?.connected ? undefined : META[c].text}
              lines={lines}
              actions={
                st?.connected ? (
                  <>
                    <button type="button" className="intLink" onClick={() => setOpen(c)}>
                      Alterar
                    </button>
                    {st.source === "plataforma" && (
                      <button type="button" className="intLink muted" onClick={() => disconnect(c)}>
                        Desconectar
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" className="intConnect" onClick={() => setOpen(c)}>
                    Conectar {META[c].name}
                  </button>
                )
              }
            />
          );
        })}
      </div>
      {open === "email" && <EmailModal onClose={() => setOpen(null)} onDone={refresh} />}
      {open === "whatsapp" && <WhatsAppModal onClose={() => setOpen(null)} onDone={refresh} />}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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

function EmailModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("SCASE Relatórios <relatorios@agenciascase.com.br>");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await agencyApi<{ testedWith: string }>("/api/integrations/channels/email", { method: "POST", body: { action: "connect", apiKey, from } });
      toast.success(`E-mail conectado. Enviamos um teste para ${r.testedWith}.`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Conectar e-mail" onClose={onClose}>
      <ol className="intSteps">
        <li>
          Crie uma conta gratuita em <a href="https://resend.com" target="_blank" rel="noreferrer">resend.com</a> e verifique o domínio da agência em <strong>Domains</strong>.
        </li>
        <li>
          Em <strong>API Keys</strong>, crie uma chave com permissão de envio e cole abaixo.
        </li>
      </ol>
      <label className="rpField">
        <span>Chave da API do Resend</span>
        <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_…" />
      </label>
      <label className="rpField">
        <span>Remetente</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} />
        <small>O domínio do remetente precisa estar verificado no Resend.</small>
      </label>
      <p className="rpFormHint">Ao conectar, enviamos um e-mail de teste para você. A chave fica guardada criptografada e não aparece mais na tela.</p>
      {error && <p className="rpError">{error}</p>}
      <div className="rpModalFoot">
        <button className="secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" type="button" disabled={busy || !apiKey || !from} onClick={submit}>
          {busy ? "Testando e conectando…" : "Conectar e-mail"}
        </button>
      </div>
    </Modal>
  );
}

function WhatsAppModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [provider, setProvider] = useState<"meta" | "zapi">("meta");
  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [documentHeader, setDocumentHeader] = useState(true);
  const [instanceId, setInstanceId] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body = provider === "meta" ? { action: "connect", provider, token, phoneNumberId, templateName, language, documentHeader } : { action: "connect", provider, instanceId, token, clientToken };
      const r = await agencyApi<{ number: string | null }>("/api/integrations/channels/whatsapp", { method: "POST", body });
      toast.success(r.number ? `WhatsApp conectado: ${r.number}` : "WhatsApp conectado");
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Conectar WhatsApp" onClose={onClose}>
      <div className="rpField">
        <span>Como a agência envia pelo WhatsApp</span>
        <div className="rpObjectives" role="radiogroup">
          <button type="button" role="radio" aria-checked={provider === "meta"} className="rpObjective" onClick={() => setProvider("meta")}>
            <strong>API oficial da Meta</strong>
            <small>Número comercial próprio, mensagens por modelo aprovado.</small>
          </button>
          <button type="button" role="radio" aria-checked={provider === "zapi"} className="rpObjective" onClick={() => setProvider("zapi")}>
            <strong>Z-API</strong>
            <small>Conecta um WhatsApp existente pelo QR Code; envia para grupos.</small>
          </button>
        </div>
      </div>
      {provider === "meta" ? (
        <>
          <p className="rpFormHint">
            No Meta for Developers, abra o app da agência → WhatsApp → Configuração da API. Use um token permanente de usuário do sistema e crie um modelo de mensagem com três variáveis: cliente, período e link do painel.
          </p>
          <label className="rpField">
            <span>Token de acesso</span>
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
          </label>
          <div className="rpTwo">
            <label className="rpField">
              <span>ID do número de telefone</span>
              <input inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890" />
            </label>
            <label className="rpField">
              <span>Nome do modelo aprovado</span>
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="relatorio_cliente" />
            </label>
          </div>
          <div className="rpTwo">
            <label className="rpField">
              <span>Idioma do modelo</span>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="rpCheck" style={{ alignSelf: "center" }}>
              <input type="checkbox" checked={documentHeader} onChange={(e) => setDocumentHeader(e.target.checked)} /> O modelo tem cabeçalho de documento (PDF)
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="rpFormHint">No painel da Z-API, abra a instância conectada ao WhatsApp da agência e copie o ID, o token e o Client-Token de segurança.</p>
          <div className="rpTwo">
            <label className="rpField">
              <span>ID da instância</span>
              <input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} />
            </label>
            <label className="rpField">
              <span>Token da instância</span>
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </label>
          </div>
          <label className="rpField">
            <span>Client-Token (segurança da conta)</span>
            <input type="password" autoComplete="off" value={clientToken} onChange={(e) => setClientToken(e.target.value)} />
          </label>
        </>
      )}
      <p className="rpFormHint">Antes de salvar, conferimos as credenciais com o provedor. Elas ficam guardadas criptografadas.</p>
      {error && <p className="rpError">{error}</p>}
      <div className="rpModalFoot">
        <button className="secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" type="button" disabled={busy || !token || (provider === "meta" ? !phoneNumberId || !templateName : !instanceId)} onClick={submit}>
          {busy ? "Verificando e conectando…" : "Conectar WhatsApp"}
        </button>
      </div>
    </Modal>
  );
}
