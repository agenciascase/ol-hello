import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Download, ExternalLink, X } from "lucide-react";
import { agencyApi, agencyDownload } from "@/lib/agency-client";
import { ReportConfigForm } from "./ReportForms";

/**
 * Creates a report for a client straight from the client list, then offers the panel link
 * and the PDF without opening the client page.
 */
export function QuickReport({ client, platforms, onClose, onDone }: { client: { id: string; name: string }; platforms: string[]; onClose: () => void; onDone: () => void }) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"" | "link" | "pdf">("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function makeLink(id: string) {
    setBusy("link");
    setError("");
    try {
      const r = await agencyApi<{ url: string | null }>(`/api/integrations/reports/${id}/share`, { method: "POST", body: { action: "create" } });
      setLink(r.url ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    } finally {
      setBusy("");
    }
  }

  if (!savedId)
    return (
      <ReportConfigForm
        clientId={client.id}
        availablePlatforms={platforms}
        onClose={onClose}
        onSaved={(id) => {
          setSavedId(id);
          onDone();
          void makeLink(id);
        }}
      />
    );

  return (
    <div className="rpModalBack" onClick={onClose}>
      <div className="rpModal qrDone" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rpModalHead">
          <h2>Relatório de {client.name} pronto</h2>
          <button className="iconButton" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <p className="qrText">Envie o link do painel para o cliente ou baixe o PDF.</p>
        <div className="qrLink">
          <input readOnly value={busy === "link" ? "Gerando link…" : link} onFocus={(e) => e.target.select()} aria-label="Link do painel" />
          <button
            type="button"
            className="primary"
            disabled={!link}
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
        {error && <p className="rpError">{error}</p>}
        <div className="qrActions">
          <button
            type="button"
            className="secondary"
            disabled={busy !== ""}
            onClick={async () => {
              setBusy("pdf");
              setError("");
              try {
                await agencyDownload(`/api/integrations/reports/${savedId}/pdf`, `relatorio-${client.name}.pdf`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Não foi possível baixar o PDF.");
              } finally {
                setBusy("");
              }
            }}
          >
            <Download size={16} /> {busy === "pdf" ? "Gerando PDF…" : "Baixar PDF"}
          </button>
          {link && (
            <a className="secondary" href={link} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Ver como o cliente vê
            </a>
          )}
          <Link className="textLink" to="/clientes/$clientId" params={{ clientId: client.id }}>
            Programar envio automático
          </Link>
        </div>
      </div>
    </div>
  );
}
