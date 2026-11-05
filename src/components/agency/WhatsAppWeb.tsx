import { useEffect, useMemo, useState } from "react";
import { agencyApi } from "@/lib/agency-client";

// WhatsApp pelo QR Code: painel de conexão (Integrações) e escolha de grupos (relatório).

type Situacao = {
  estado: "desconectado" | "conectando" | "aguardando_qr" | "conectado";
  qr: string | null;
  numero: string | null;
  erro: string | null;
};

/** Mostra o QR Code e acompanha até o WhatsApp conectar. Chama onConectado(numero) quando conectar. */
export function QrConnect({ onConectado }: { onConectado: (numero: string | null) => void }) {
  const [s, setS] = useState<Situacao | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function ler() {
    try {
      const r = await agencyApi<Situacao>("/api/integrations/whatsapp-web");
      setS(r);
      return r;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ver o WhatsApp.");
      return null;
    }
  }
  useEffect(() => {
    void ler();
  }, []);
  // enquanto não conecta, confere a cada 2 s (o QR Code muda sozinho de tempos em tempos)
  useEffect(() => {
    if (!s || s.estado === "conectado" || s.estado === "desconectado") return;
    const t = setInterval(() => void ler(), 2000);
    return () => clearInterval(t);
  }, [s?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(acao: "conectar" | "desconectar") {
    setOcupado(true);
    setErro("");
    try {
      setS(
        await agencyApi<Situacao>("/api/integrations/whatsapp-web", {
          method: "POST",
          body: { acao },
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      className="rfWaPreview"
      style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}
    >
      {!s ? (
        <p>Verificando o WhatsApp…</p>
      ) : s.estado === "conectado" ? (
        <>
          <p>
            ✅ WhatsApp conectado
            {s.numero ? (
              <>
                : <b>{s.numero}</b>
              </>
            ) : null}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="primary" type="button" onClick={() => onConectado(s.numero)}>
              Usar este WhatsApp nos relatórios
            </button>
            <button
              className="secondary"
              type="button"
              disabled={ocupado}
              onClick={() => void acao("desconectar")}
            >
              Desconectar
            </button>
          </div>
        </>
      ) : s.estado === "aguardando_qr" && s.qr ? (
        <>
          <img
            src={s.qr}
            alt="QR Code para conectar o WhatsApp"
            width={260}
            height={260}
            style={{ background: "#fff", padding: 8, borderRadius: 12 }}
          />
          <p style={{ maxWidth: 420 }}>
            No celular do número que está nos grupos:{" "}
            <b>WhatsApp → Aparelhos conectados → Conectar aparelho</b> e aponte para o código. O
            código muda sozinho de tempos em tempos.
          </p>
        </>
      ) : s.estado === "conectando" ? (
        <p>Conectando ao WhatsApp…</p>
      ) : (
        <>
          <p style={{ maxWidth: 420 }}>
            Conecte o WhatsApp que está nos grupos dos clientes. Ele continua funcionando
            normalmente no celular.
          </p>
          <button
            className="primary"
            type="button"
            disabled={ocupado}
            onClick={() => void acao("conectar")}
          >
            {ocupado ? "Gerando…" : "Gerar QR Code"}
          </button>
        </>
      )}
      {(erro || s?.erro) && <p className="rpError">{erro || s?.erro}</p>}
    </div>
  );
}

type Grupo = { id: string; nome: string; participantes: number };

/** Lista os grupos do WhatsApp conectado para marcar quais recebem o relatório. */
export function GroupPicker({
  selecionados,
  onChange,
  onStatus,
}: {
  selecionados: string[];
  onChange: (ids: string[]) => void;
  onStatus?: (conectado: boolean) => void;
}) {
  const [dados, setDados] = useState<{
    conectado: boolean;
    grupos: Grupo[];
    error?: string;
  } | null>(null);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar(atualizar = false) {
    setCarregando(true);
    try {
      const r = await agencyApi<{ conectado: boolean; grupos: Grupo[]; error?: string }>(
        `/api/integrations/whatsapp-web/grupos${atualizar ? "?atualizar=1" : ""}`,
      );
      setDados(r);
      onStatus?.(r.conectado);
    } catch (e) {
      setDados({
        conectado: false,
        grupos: [],
        error: e instanceof Error ? e.message : "Não consegui listar os grupos.",
      });
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    void carregar();
  }, []);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = dados?.grupos ?? [];
    return q ? lista.filter((g) => g.nome.toLowerCase().includes(q)) : lista;
  }, [dados, busca]);
  const sumidos = selecionados.filter(
    (id) => dados?.conectado && !dados.grupos.some((g) => g.id === id),
  );
  const alternar = (id: string) =>
    onChange(
      selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id],
    );

  if (!dados) return <small>Carregando os grupos do WhatsApp…</small>;
  if (!dados.conectado)
    return (
      <small>
        {dados.error ? dados.error + " " : ""}Para enviar em grupos, conecte o{" "}
        <b>WhatsApp pelo QR Code</b> em Integrações.
        {selecionados.length
          ? ` (${selecionados.length} grupo(s) já escolhido(s) neste relatório.)`
          : ""}
      </small>
    );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar grupo pelo nome"
          style={{ flex: 1 }}
        />
        <button
          className="secondary"
          type="button"
          disabled={carregando}
          onClick={() => void carregar(true)}
        >
          {carregando ? "Atualizando…" : "Atualizar lista"}
        </button>
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          display: "grid",
          gap: 4,
          border: "1px solid var(--line, #d7e0da)",
          borderRadius: 10,
          padding: 8,
        }}
      >
        {visiveis.length === 0 && <small>Nenhum grupo encontrado.</small>}
        {visiveis.map((g) => (
          <label key={g.id} className="rpCheck">
            <input
              type="checkbox"
              checked={selecionados.includes(g.id)}
              onChange={() => alternar(g.id)}
            />{" "}
            {g.nome}
            <small style={{ marginLeft: 6, opacity: 0.6 }}>{g.participantes} participantes</small>
          </label>
        ))}
      </div>
      <small>
        {selecionados.length
          ? `${selecionados.length} grupo(s) escolhido(s).`
          : "Nenhum grupo escolhido."}
        {sumidos.length
          ? ` ${sumidos.length} grupo(s) escolhido(s) antes não aparecem mais (o número saiu do grupo?).`
          : ""}
      </small>
    </div>
  );
}
