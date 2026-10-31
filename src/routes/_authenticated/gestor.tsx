import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AgencyShell } from "@/components/agency/AgencyShell";
import { agencyApi } from "@/lib/agency-client";
import "../../gestor.css";

export const Route = createFileRoute("/_authenticated/gestor")({ component: GestorPage });

/* ───────────── dados (mesmo formato do app Scase Gestor) ───────────── */

type Saldo = {
  plataforma: string;
  conta?: string;
  modo: string;
  restante: number | null;
  gasto_dia: number;
  status: string;
  dias: number | null;
};
type Sug = {
  id: number;
  prioridade: string;
  titulo: string;
  motivo: string;
  campanha: string;
  plataforma?: string;
  tipo?: string;
  impacto?: string;
  desfazer?: string;
  orcamento?: boolean;
  execucao?: string;
  porque?: { importa: string; faco: string };
};
type Camp = {
  nome: string;
  plataforma: string;
  tipo: string;
  unidade: string;
  gasto: number;
  resultado: number;
  cliques: number;
  custo: number | null;
  custo_ant: number | null;
};
type Ponto = {
  dia: string;
  gasto: number;
  resultado: number;
  cliques?: number;
  impressoes?: number;
  meta?: number;
  google?: number;
};
type Kpi = {
  gasto: number;
  gasto_ant: number;
  resultado: number;
  resultado_ant: number;
  cliques: number;
  impressoes: number;
  unidade: string;
  custo: number | null;
  custo_ant: number | null;
};
type Doc = {
  nome: string;
  moeda?: string;
  plataformas?: string[];
  gestor?: string | null;
  contas?: { meta?: string | null; google?: string | null };
  periodo?: { de: string; ate: string };
  saldo?: Saldo[];
  kpi?: Kpi;
  diario?: Ponto[];
  serie?: Ponto[];
  campanhas?: Camp[];
  sugestoes?: Sug[];
  avaliacao?: { nota: number | null; resumo: string; fortes: string[]; melhorar: string[] };
  saude?: string;
  avisos?: string[];
  atualizado_em?: string;
};
type Cartao = Doc & { id: string; erro: string | null };
type Pedido = {
  id: string;
  client_id: string;
  tipo: string;
  chave: string | null;
  dados: Record<string, unknown>;
  status: string;
  resultado: string | null;
  desfazer: string | null;
  link: string | null;
  criado_em: string;
};

// As tabelas do Gestor ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

const GESTORES = ["Augusto Venâncio", "Alecsander Chipoletti", "Matheus Aracema"];
const gestoresDe = (c: Doc) => (c.gestor ? c.gestor.split(/\s*[,;·]\s*/).filter(Boolean) : []);

/* ───────────── formatação ───────────── */

const SIMB: Record<string, string> = { EUR: "€ ", USD: "US$ " };
const brl = (v: number | null | undefined, moeda = "BRL") =>
  v == null
    ? "—"
    : (SIMB[moeda] ?? "R$ ") +
      Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number | null | undefined, moeda = "BRL") =>
  v == null
    ? "—"
    : (SIMB[moeda] ?? "R$ ") + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const int = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const dm = (s?: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "");
const dmy = (s?: string) => (s ? dm(s) + "/" + s.slice(0, 4) : "");
const quando = (s?: string) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
const iso = (d: Date) =>
  d.getFullYear() +
  "-" +
  String(d.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(d.getDate()).padStart(2, "0");

const SAUDE: Record<string, [string, string]> = {
  critico: ["Crítico", "bad"],
  atencao: ["Atenção", "warn"],
  ok: ["Em dia", "good"],
  parado: ["Parado", "neutral"],
};
const ORD: Record<string, number> = { critico: 0, atencao: 1, parado: 2, ok: 3 };
const EXEC: Record<string, string> = {
  executa: "Aplico na conta",
  prepara: "Preparo e te mostro antes",
  investiga: "Analiso e te respondo",
  cliente: "Depende do cliente",
};
const ST: Record<string, [string, string]> = {
  pendente: ["Na fila do Claude", "info"],
  executando: ["Otimizando…", "info"],
  feito: ["Otimizado", "good"],
  precisa_voce: ["Precisa de você", "warn"],
  erro: ["Não deu certo", "bad"],
  ignorado: ["Ignorado", "neutral"],
};
const ST_CAMP: Record<string, [string, string]> = {
  pendente: ["Na fila do Claude", "warn"],
  criando: ["Criando", "info"],
  criada: ["Criada pausada", "good"],
  ativando: ["Ativando", "info"],
  ativa: ["No ar", "good"],
  precisa_voce: ["Precisa de você", "warn"],
  erro: ["Erro", "bad"],
};
const PER: Record<string, string> = {
  hoje: "Hoje",
  "7": "7 dias",
  "14": "14 dias",
  "30": "30 dias",
};
const PER_ANT: Record<string, string> = {
  hoje: "",
  "7": "7 dias anteriores",
  "14": "14 dias anteriores",
  "30": "30 dias anteriores",
};
const MET: Record<string, string> = {
  gasto: "Investido",
  resultado: "Resultados",
  custo: "Custo por resultado",
  cliques: "Cliques",
  impressoes: "Impressões",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
};
const MENOR: Record<string, boolean> = { custo: true, cpc: true, cpm: true };
const OBJ: Record<string, Array<[string, string]>> = {
  Meta: [
    ["mensagens", "Mensagens no WhatsApp"],
    ["cadastros", "Cadastros (formulário)"],
    ["vendas", "Vendas / conversões no site"],
    ["trafego_perfil", "Visitas ao perfil e seguidores"],
    ["trafego_site", "Visitas ao site"],
    ["engajamento", "Engajamento"],
    ["reconhecimento", "Alcance / reconhecimento"],
  ],
  Google: [
    ["pesquisa", "Pesquisa (palavras-chave)"],
    ["pmax", "Performance Max"],
    ["display", "Display (banners)"],
    ["video", "Vídeo no YouTube"],
  ],
};

const ler = (k: string, padrao: string) => {
  try {
    return localStorage.getItem("scase.gestor." + k) || padrao;
  } catch {
    return padrao;
  }
};
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem("scase.gestor." + k, v);
  } catch {
    /* sem armazenamento */
  }
};

type Tot = {
  gasto: number;
  resultado: number;
  cliques: number;
  impressoes: number;
  custo: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
};
function somar(xs: Ponto[]): Tot {
  const t = { gasto: 0, resultado: 0, cliques: 0, impressoes: 0 };
  for (const x of xs) {
    t.gasto += x.gasto || 0;
    t.resultado += x.resultado || 0;
    t.cliques += x.cliques || 0;
    t.impressoes += x.impressoes || 0;
  }
  return {
    ...t,
    custo: t.resultado ? t.gasto / t.resultado : null,
    ctr: t.impressoes ? (t.cliques / t.impressoes) * 100 : null,
    cpc: t.cliques ? t.gasto / t.cliques : null,
    cpm: t.impressoes ? (t.gasto / t.impressoes) * 1000 : null,
  };
}
function janela(c: Doc, per: string): { atual: Tot; ant: Tot | null } | null {
  const s = c.serie;
  if (!s?.length) return null;
  if (per === "hoje") return { atual: somar(s.slice(-1)), ant: null };
  const n = Number(per),
    comp = s.slice(0, -1);
  return {
    atual: somar(comp.slice(-n)),
    ant: comp.length >= 2 * n ? somar(comp.slice(-2 * n, -n)) : null,
  };
}
const valorMet = (t: Tot, k: string) => (t as unknown as Record<string, number | null>)[k] ?? null;
function fmtMet(k: string, v: number | null, moeda: string, curto = false) {
  if (v == null) return "—";
  if (k === "ctr") return pct(v);
  if (["resultado", "cliques", "impressoes"].includes(k)) return int(v);
  return k === "gasto" && curto ? brl0(v, moeda) : brl(v, moeda);
}
function VarCurta({ k, a, b }: { k: string; a: number | null; b: number | null }) {
  if (a == null || !b) return null;
  const p = ((a - b) / b) * 100;
  if (Math.abs(p) < 0.5) return <span className="vr neutral">=</span>;
  const bom = MENOR[k] ? p < 0 : p > 0;
  const cor =
    k === "gasto" || k === "impressoes" || Math.abs(p) < 5 ? "neutral" : bom ? "good" : "bad";
  return (
    <span className={"vr " + cor}>
      {p > 0 ? "▲" : "▼"}
      {Math.abs(p).toFixed(0)}%
    </span>
  );
}
function Variacao({
  a,
  b,
  menor,
  colorir = true,
  vs,
}: {
  a: number;
  b: number | null | undefined;
  menor: boolean;
  colorir?: boolean;
  vs: string;
}) {
  if (!b) return <span className="var neutral">sem comparação</span>;
  const p = ((a - b) / b) * 100;
  if (Math.abs(p) < 0.5) return <span className="var neutral">igual a {vs}</span>;
  const bom = menor ? p < 0 : p > 0;
  const k = !colorir || Math.abs(p) < 5 ? "neutral" : bom ? "good" : "bad";
  return (
    <span className={"var " + k}>
      {p > 0 ? "▲" : "▼"} {Math.abs(p).toFixed(0)}% vs {vs}
    </span>
  );
}
const nomeMet = (k: string, c?: Doc) =>
  k === "resultado" ? c?.kpi?.unidade || "resultados" : (MET[k] ?? k);
const plats = (c: Doc) =>
  (c.plataformas ?? []).map((p) => (
    <span key={p} className={"pl " + p.toLowerCase()}>
      {p}
    </span>
  ));
const chaveSug = (c: Doc, s: Sug) => `${c.periodo?.de ?? ""}_${s.id}`;

function GaugeSaldo({ s, moeda }: { s: Saldo; moeda: string }) {
  const semLimite = s.restante == null && s.status !== "zerado";
  const k = semLimite ? "ok" : s.status;
  const w =
    s.status === "zerado" || semLimite
      ? 100
      : Math.max(4, Math.min(100, ((s.dias ?? 30) / 30) * 100));
  const fim = new Date();
  fim.setDate(fim.getDate() + Math.floor(s.dias || 0));
  const chip =
    s.status === "zerado"
      ? ["Acabou", "bad"]
      : semLimite
        ? ["Não acaba", "neutral"]
        : s.status === "acabando"
          ? ["Acabando", "warn"]
          : ["Saldo ok", "good"];
  const big =
    s.status === "zerado"
      ? "Sem saldo"
      : semLimite
        ? "Sem limite"
        : "Restam " + brl(s.restante, moeda);
  const ritmo = s.gasto_dia ? ` · gasta ${brl(s.gasto_dia, moeda)}/dia` : "";
  const det =
    s.status === "zerado"
      ? "Anúncios parados até o cliente recarregar."
      : semLimite
        ? "Pago no cartão, não tem saldo para acabar" + ritmo
        : (s.dias != null && s.dias < 1
            ? "Acaba hoje"
            : `Dá para ~${Math.floor(s.dias ?? 0)} dia${Math.floor(s.dias ?? 0) === 1 ? "" : "s"} (até ${dm(iso(fim))})`) +
          ritmo;
  return (
    <div className={"saldo " + k} title={s.modo}>
      <div className="t">
        <span>Saldo {s.plataforma}</span>
        <span className={"chip " + chip[1]}>{chip[0]}</span>
      </div>
      <div className="big num">{big}</div>
      <div className="d num">{det}</div>
      {!semLimite && (
        <div className="gauge" title="Barra cheia = 30 dias de saldo">
          <i className={k} style={{ width: w + "%" }} />
        </div>
      )}
    </div>
  );
}

function Spark({ c }: { c: Doc }) {
  const d = (c.diario ?? []).map((x) => x.gasto);
  if (d.length < 2) return null;
  const W = 260,
    H = 34,
    m = Math.max(1, ...d),
    sx = W / (d.length - 1);
  const pts = d.map((v, i) => [i * sx, H - 3 - ((H - 6) * v) / m] as const);
  const p = pts.map((x) => x[0].toFixed(1) + "," + x[1].toFixed(1)).join(" ");
  const L = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label="Investimento diário nos últimos 30 dias"
    >
      <polygon className="a" points={`0,${H} ${p} ${W},${H}`} />
      <polyline className="ln" points={p} />
      <circle className="d" cx={L[0]} cy={L[1]} r={2.5} />
    </svg>
  );
}

function Grafico({ c }: { c: Doc }) {
  const d = c.diario ?? [];
  if (!d.length) return <div className="note">Sem dados diários.</div>;
  const W = 760,
    H = 230,
    ml = 52,
    mr = 40,
    mt = 12,
    mb = 28,
    iw = W - ml - mr,
    ih = H - mt - mb;
  const gmax = Math.max(1, ...d.map((x) => x.gasto)),
    rmax = Math.max(1, ...d.map((x) => x.resultado));
  const bw = iw / d.length;
  const pts = d.map((x, i) => [ml + i * bw + bw / 2, mt + ih - (ih * x.resultado) / rmax] as const);
  const L = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Investimento e resultados por dia nos últimos 30 dias"
    >
      <g className="grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={ml} x2={W - mr} y1={mt + (ih * i) / 4} y2={mt + (ih * i) / 4} />
        ))}
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={"t" + i}>
          <text x={ml - 6} y={mt + (ih * i) / 4 + 3} textAnchor="end">
            {(gmax * (1 - i / 4)).toFixed(0)}
          </text>
          <text x={W - mr + 6} y={mt + (ih * i) / 4 + 3}>
            {(rmax * (1 - i / 4)).toFixed(0)}
          </text>
        </g>
      ))}
      {d.map((x, i) => {
        const X = ml + i * bw,
          hm = (ih * (x.meta || 0)) / gmax,
          hg = (ih * (x.google || 0)) / gmax;
        return (
          <g key={x.dia}>
            {hg > 0 && (
              <rect
                className="bg"
                x={X + bw * 0.15}
                y={mt + ih - hg}
                width={bw * 0.7}
                height={hg}
              />
            )}
            {hm > 0 && (
              <rect
                className="bm"
                x={X + bw * 0.15}
                y={mt + ih - hg - hm}
                width={bw * 0.7}
                height={hm}
              />
            )}
            <rect x={X} y={mt} width={bw} height={ih} fill="transparent">
              <title>{`${dm(x.dia)}: ${brl(x.gasto, c.moeda)} · ${int(x.resultado)} resultados`}</title>
            </rect>
            {(i % 5 === 0 || i === d.length - 1) && (
              <text x={X + bw / 2} y={H - 8} textAnchor="middle">
                {dm(x.dia)}
              </text>
            )}
          </g>
        );
      })}
      <polyline
        className="ln2"
        points={pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}
      />
      <circle className="dot" cx={L[0]} cy={L[1]} r={3.5} />
    </svg>
  );
}

function PorQue({ s, aberto }: { s: Sug; aberto?: boolean }) {
  if (!s.porque?.importa && !s.porque?.faco) return null;
  return (
    <details className="pq" open={aberto}>
      <summary>Por que isso?</summary>
      {s.porque?.importa && (
        <p>
          <b>Por que importa:</b> {s.porque.importa}
        </p>
      )}
      {s.porque?.faco && (
        <p>
          <b>O que eu faço ao otimizar:</b> {s.porque.faco}
        </p>
      )}
    </details>
  );
}

function avisoRecarga(c: Doc, s: Saldo) {
  return (
    `Olá, pessoal! Tudo bem? 😊\n\nPassando para avisar que o saldo de anúncios ${s.plataforma === "Google" ? "do Google" : "do Facebook/Instagram"} da ${c.nome} ` +
    (s.status === "zerado"
      ? "acabou e os anúncios estão parados no momento."
      : `está acabando: restam ${brl(s.restante, c.moeda)}, o que dá para ${(s.dias ?? 0) < 1 ? "hoje" : `mais uns ${Math.floor(s.dias ?? 0)} dias`}.`) +
    `\n\nPara as campanhas seguirem rodando sem interrupção, é só fazer uma nova recarga. Qualquer dúvida, estamos à disposição!`
  );
}

/* ───────────── página ───────────── */

function GestorPage() {
  const qc = useQueryClient();
  const painel = useQuery({
    queryKey: ["gestor-painel"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("gestor_painel")
        .select("client_id,data,erro,updated_at");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ client_id: string; data: Doc; erro: string | null }>).map(
        (r) => ({ ...r.data, id: r.client_id, erro: r.erro }),
      ) as Cartao[];
    },
  });
  const pedidos = useQuery({
    queryKey: ["gestor-pedidos"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("gestor_pedidos")
        .select("id,client_id,tipo,chave,dados,status,resultado,desfazer,link,criado_em")
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Pedido[];
    },
  });
  const [gestor, setGestor] = useState(() => ler("quem", "todos"));
  const [filtro, setFiltro] = useState(() => ler("filtro", "todos"));
  const [per, setPer] = useState(() => ler("per", "7"));
  const [mets, setMets] = useState<string[]>(() => {
    try {
      const m = JSON.parse(ler("mets", "null")) as unknown;
      return Array.isArray(m) && m.length ? (m as string[]) : ["gasto", "resultado", "custo"];
    } catch {
      return ["gasto", "resultado", "custo"];
    }
  });
  const [sel, setSel] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ t: string; k: string } | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const todos = useMemo(() => (painel.data ?? []).filter((c) => c.kpi && c.nome), [painel.data]);
  const comErro = (painel.data ?? []).filter((c) => !c.kpi && c.erro);
  const semGestor = todos.filter((c) => !gestoresDe(c).length);
  const doGestor =
    gestor === "sem"
      ? semGestor
      : gestor === "todos"
        ? todos
        : todos.filter((c) => gestoresDe(c).includes(gestor));
  const pedidosDe = (id: string) => (pedidos.data ?? []).filter((p) => p.client_id === id);
  const pend = (c: Cartao) =>
    (c.sugestoes ?? []).filter(
      (s) =>
        !(pedidos.data ?? []).some(
          (p) =>
            p.client_id === c.id &&
            p.chave === chaveSug(c, s) &&
            (p.tipo === "otimizar" || p.tipo === "ignorar"),
        ),
    );
  const lista = doGestor
    .filter((c) =>
      filtro === "todos"
        ? true
        : filtro === "atencao"
          ? c.saude === "critico" || c.saude === "atencao"
          : filtro === "zerado"
            ? (c.saldo ?? []).some((s) => s.status === "zerado")
            : filtro === "acabando"
              ? (c.saldo ?? []).some((s) => s.status === "acabando")
              : filtro === "sugestoes"
                ? pend(c).length > 0
                : filtro === "meta"
                  ? (c.plataformas ?? []).includes("Meta")
                  : (c.plataformas ?? []).includes("Google"),
    )
    .sort(
      (a, b) =>
        (ORD[a.saude ?? "ok"] ?? 3) - (ORD[b.saude ?? "ok"] ?? 3) || a.nome.localeCompare(b.nome),
    );
  const reais = doGestor.filter((c) => !c.moeda || c.moeda === "BRL");
  const js = reais.map((c) => janela(c, per)).filter((j): j is NonNullable<typeof j> => !!j);
  const gasto = js.reduce((s, j) => s + j.atual.gasto, 0);
  const gastoAnt = js.every((j) => j.ant) ? js.reduce((s, j) => s + (j.ant?.gasto ?? 0), 0) : 0;
  const ultima = todos
    .map((c) => c.atualizado_em ?? "")
    .sort()
    .pop();
  const cliente = sel ? (todos.find((c) => c.id === sel) ?? null) : null;

  const avisar = (t: string, k = "ok") => {
    setFlash({ t, k });
    window.setTimeout(() => setFlash(null), 7000);
  };
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["gestor-pedidos"] });
  };
  const escolher = (setter: (v: string) => void, chave: string) => (v: string) => {
    setter(v);
    guardar(chave, v);
  };

  async function atualizarAgora(id?: string) {
    setAtualizando(true);
    try {
      type Lote = { feitos: number; erros: unknown[]; restantes: number };
      if (id) {
        const r = await agencyApi<Lote>(`/api/cron/gestor?cliente=${id}`, { method: "POST" });
        await qc.invalidateQueries({ queryKey: ["gestor-painel"] });
        avisar(
          r.feitos
            ? "Cliente atualizado agora."
            : "Não consegui atualizar este cliente agora. Veja o aviso no topo da ficha.",
          r.feitos ? "ok" : "err",
        );
        return;
      }
      // Todos os clientes, em lotes (o servidor pula quem foi atualizado nos últimos 2 minutos).
      let feitos = 0,
        erros = 0;
      for (let rodada = 0; rodada < 60; rodada++) {
        const r = await agencyApi<Lote>("/api/cron/gestor?limite=6&idade=2", { method: "POST" });
        feitos += r.feitos;
        erros += r.erros.length;
        await qc.invalidateQueries({ queryKey: ["gestor-painel"] });
        if (!r.restantes || (!r.feitos && !r.erros.length)) break;
        setFlash({ t: `Atualizando… ${feitos + erros} feitos, faltam ${r.restantes}.`, k: "info" });
      }
      avisar(
        `${feitos} cliente(s) atualizados agora.${erros ? ` ${erros} com erro na leitura (aviso no cartão).` : ""}`,
        feitos ? "ok" : "err",
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não consegui atualizar agora.", "err");
    } finally {
      setAtualizando(false);
    }
  }

  const stats = [
    {
      value: doGestor.length ? brl0(gasto) : "—",
      label: per === "hoje" ? "Investido hoje" : `Investido em ${PER[per]}`,
    },
    {
      value: String(
        doGestor.filter((c) => (c.saldo ?? []).some((s) => s.status === "zerado")).length,
      ),
      label: "Sem saldo",
    },
    {
      value: String(doGestor.reduce((s, c) => s + pend(c).length, 0)),
      label: "Sugestões aguardando",
    },
    { value: String(doGestor.length), label: "Clientes" },
  ];

  return (
    <AgencyShell
      title="Gestor IA"
      description={`Um cartão por cliente: saldo, números e melhorias. Atualiza sozinho a cada 15 minutos, das 6h às 22h${ultima ? ` · última atualização ${quando(ultima)}` : ""}.`}
      stats={stats}
      actions={
        <button
          className="secondary"
          onClick={() => void atualizarAgora(sel ?? undefined)}
          disabled={atualizando}
        >
          <RefreshCw size={16} />{" "}
          {atualizando ? "Atualizando…" : sel ? "Atualizar este cliente" : "Atualizar agora"}
        </button>
      }
    >
      <div className="sg">
        {flash && (
          <div className={"msg " + flash.k} style={{ marginBottom: 12 }} role="status">
            {flash.t}
          </div>
        )}
        {painel.isLoading ? (
          <div className="card empty">Carregando os clientes…</div>
        ) : painel.error ? (
          <div className="card empty">
            Não consegui ler os cartões: {(painel.error as Error).message}
          </div>
        ) : cliente ? (
          <Ficha
            c={cliente}
            pedidos={pedidosDe(cliente.id)}
            per={per}
            setPer={escolher(setPer, "per")}
            mets={mets}
            setMets={(m) => {
              setMets(m);
              guardar("mets", JSON.stringify(m));
            }}
            pend={pend(cliente)}
            onVoltar={() => setSel(null)}
            avisar={avisar}
            recarregar={recarregar}
          />
        ) : (
          <>
            <div className="gest" role="group" aria-label="Filtrar por gestor">
              <span className="lb">Gestor</span>
              {[
                ["todos", "Todos", todos.length] as const,
                ...GESTORES.map(
                  (g) => [g, g, todos.filter((c) => gestoresDe(c).includes(g)).length] as const,
                ),
                ...(semGestor.length ? [["sem", "Sem gestor", semGestor.length] as const] : []),
              ].map(([k, t, n]) => (
                <button
                  key={k}
                  aria-pressed={gestor === k}
                  onClick={() => escolher(setGestor, "quem")(k)}
                >
                  {t}
                  <span className="ct num">{n}</span>
                </button>
              ))}
            </div>
            <div className="summary">
              <div className="stat">
                <div className="l">
                  {per === "hoje" ? "Investido hoje" : `Investido em ${PER[per]}`}
                </div>
                <div className="v num">{doGestor.length ? brl0(gasto) : "—"}</div>
                <div className="h">
                  {per === "hoje" ? (
                    "até a última atualização"
                  ) : (
                    <Variacao
                      a={gasto}
                      b={gastoAnt}
                      menor={false}
                      colorir={false}
                      vs={PER_ANT[per] ?? ""}
                    />
                  )}
                </div>
              </div>
              <button className="stat bad" onClick={() => escolher(setFiltro, "filtro")("zerado")}>
                <div className="l">Sem saldo</div>
                <div className="v num">
                  {
                    doGestor.filter((c) => (c.saldo ?? []).some((s) => s.status === "zerado"))
                      .length
                  }
                </div>
                <div className="h">anúncios parados</div>
              </button>
              <button
                className="stat warn"
                onClick={() => escolher(setFiltro, "filtro")("acabando")}
              >
                <div className="l">Saldo acabando</div>
                <div className="v num">
                  {
                    doGestor.filter((c) => (c.saldo ?? []).some((s) => s.status === "acabando"))
                      .length
                  }
                </div>
                <div className="h">até 7 dias</div>
              </button>
              <button className="stat" onClick={() => escolher(setFiltro, "filtro")("sugestoes")}>
                <div className="l">Sugestões</div>
                <div className="v num">{doGestor.reduce((s, c) => s + pend(c).length, 0)}</div>
                <div className="h">aguardando você</div>
              </button>
              <div className="stat">
                <div className="l">Clientes</div>
                <div className="v num">{doGestor.length}</div>
                <div className="h">{ultima ? "atualizado " + quando(ultima) : "gerenciados"}</div>
              </div>
            </div>
            <div className="filters" role="group" aria-label="Filtrar clientes">
              {[
                ["todos", "Todos"],
                ["atencao", "Precisam de atenção"],
                ["zerado", "Sem saldo"],
                ["meta", "Meta"],
                ["google", "Google"],
              ].map(([k, t]) => (
                <button
                  key={k}
                  aria-pressed={filtro === k}
                  onClick={() => escolher(setFiltro, "filtro")(k!)}
                >
                  {t}
                </button>
              ))}
            </div>
            <BarraVis
              per={per}
              setPer={escolher(setPer, "per")}
              mets={mets}
              setMets={(m) => {
                setMets(m);
                guardar("mets", JSON.stringify(m));
              }}
            />
            {comErro.length > 0 && (
              <div className="msg err" style={{ marginBottom: 12 }}>
                {comErro.length} cliente(s) ainda sem números por erro na leitura:{" "}
                {comErro
                  .slice(0, 4)
                  .map((c) => c.nome)
                  .join(", ")}
                {comErro.length > 4 ? "…" : ""}
              </div>
            )}
            <div className="cards">
              {!todos.length ? (
                <div className="card empty">
                  Os clientes aparecem aqui assim que a primeira atualização terminar. Clique em
                  "Atualizar agora" para começar.
                </div>
              ) : !doGestor.length ? (
                <div className="card empty">
                  {gestor === "sem"
                    ? "Todos os clientes já têm gestor."
                    : `Nenhum cliente marcado para ${gestor} ainda.`}
                </div>
              ) : !lista.length ? (
                <div className="card empty">Nenhum cliente neste filtro.</div>
              ) : (
                lista.map((c) => {
                  const s = SAUDE[c.saude ?? "ok"] ?? SAUDE["ok"]!,
                    np = pend(c).length,
                    j = janela(c, per),
                    moeda = c.moeda ?? "BRL";
                  return (
                    <button
                      key={c.id}
                      className={"cc " + (c.saude ?? "")}
                      onClick={() => {
                        setSel(c.id);
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      <div className="row">
                        <div style={{ minWidth: 0 }}>
                          <div className="n">{c.nome}</div>
                          <div className="plats">{plats(c)}</div>
                          {gestor === "todos" && gestoresDe(c).length > 0 && (
                            <div className="gs">{gestoresDe(c).join(" · ")}</div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 4,
                          }}
                        >
                          <span className={"chip " + s[1]}>{s[0]}</span>
                          {c.avaliacao?.nota != null && (
                            <span className="note num">
                              Nota {String(c.avaliacao.nota).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      </div>
                      {(c.saldo ?? []).map((x, i) => (
                        <GaugeSaldo key={i} s={x} moeda={moeda} />
                      ))}
                      {mets.length > 0 &&
                        (j ? (
                          <div className="nums num">
                            {mets.map((m) => (
                              <div key={m}>
                                <div className="l">{m === "custo" ? "Custo" : nomeMet(m, c)}</div>
                                <div className="v">
                                  {fmtMet(m, valorMet(j.atual, m), moeda, true)}
                                </div>
                                {j.ant && (
                                  <VarCurta k={m} a={valorMet(j.atual, m)} b={valorMet(j.ant, m)} />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="note">{PER[per]}: aparece na próxima atualização.</div>
                        ))}
                      <div className="spark">
                        <Spark c={c} />
                      </div>
                      {np > 0 && (
                        <span className="chip info" style={{ alignSelf: "flex-start" }}>
                          {np} sugest{np > 1 ? "ões" : "ão"}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </AgencyShell>
  );
}

function BarraVis({
  per,
  setPer,
  mets,
  setMets,
}: {
  per: string;
  setPer: (v: string) => void;
  mets: string[];
  setMets: (m: string[]) => void;
}) {
  return (
    <div className="vis">
      <span className="lb">Período</span>
      <div className="seg" role="group" aria-label="Período">
        {["hoje", "7", "14", "30"].map((k) => (
          <button key={k} aria-pressed={per === k} onClick={() => setPer(k)}>
            {PER[k]}
          </button>
        ))}
      </div>
      <span className="lb">Métricas</span>
      <div className="mets" role="group" aria-label="Métricas para mostrar">
        {Object.entries(MET).map(([k, t]) => (
          <button
            key={k}
            aria-pressed={mets.includes(k)}
            onClick={() =>
              setMets(
                mets.includes(k)
                  ? mets.filter((x) => x !== k)
                  : Object.keys(MET).filter((x) => x === k || mets.includes(x)),
              )
            }
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── ficha do cliente ───────────── */

function Ficha({
  c,
  pedidos,
  per,
  setPer,
  mets,
  setMets,
  pend,
  onVoltar,
  avisar,
  recarregar,
}: {
  c: Cartao;
  pedidos: Pedido[];
  per: string;
  setPer: (v: string) => void;
  mets: string[];
  setMets: (m: string[]) => void;
  pend: Sug[];
  onVoltar: () => void;
  avisar: (t: string, k?: string) => void;
  recarregar: () => void;
}) {
  const [tab, setTab] = useState<"sugestoes" | "campanha" | "alteracao">("sugestoes");
  const moeda = c.moeda ?? "BRL";
  const s = SAUDE[c.saude ?? "ok"] ?? SAUDE["ok"]!;
  const j = janela(c, per);
  const otimizaveis = pend.filter((x) => x.execucao !== "cliente");
  const nota = c.avaliacao?.nota;
  const notaK = nota == null ? "" : nota >= 7.5 ? "good" : nota >= 5 ? "warn" : "bad";
  const campsPedidas = pedidos.filter((p) => p.tipo === "campanha");
  const [confirmar, setConfirmar] = useState<number[] | null>(null);

  async function otimizar(ids: number[]) {
    const itens = ids
      .map((id) => (c.sugestoes ?? []).find((x) => x.id === id))
      .filter((x): x is Sug => !!x);
    const { error } = await db.from("gestor_pedidos").insert(
      itens.map((a) => ({
        client_id: c.id,
        tipo: "otimizar",
        chave: chaveSug(c, a),
        status: "pendente",
        dados: { cliente: c.nome, contas: c.contas, periodo: c.periodo, sugestao: a },
      })),
    );
    if (error) {
      avisar("Não consegui registrar a otimização. Tente de novo.", "err");
      return;
    }
    setConfirmar(null);
    recarregar();
    avisar(
      `${itens.length} otimização(ões) na fila do Claude. Ele só executa o que você confirmou aqui e grava o que mudou e como desfazer.`,
    );
  }
  async function ignorar(a: Sug) {
    const { error } = await db.from("gestor_pedidos").insert({
      client_id: c.id,
      tipo: "ignorar",
      chave: chaveSug(c, a),
      status: "ignorado",
      dados: { cliente: c.nome, sugestao: a },
    });
    if (error) avisar("Não consegui salvar. Tente de novo.", "err");
    else recarregar();
  }
  async function apagar(id: string) {
    const { error } = await db.from("gestor_pedidos").delete().eq("id", id);
    if (error) avisar("Não consegui desfazer. Tente de novo.", "err");
    else recarregar();
  }
  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Aviso copiado. É só colar no grupo do cliente.");
    } catch {
      avisar("Não consegui copiar automaticamente. Tente de novo.", "info");
    }
  }

  const itensConfirmar = (confirmar ?? [])
    .map((id) => (c.sugestoes ?? []).find((x) => x.id === id))
    .filter((x): x is Sug => !!x);

  return (
    <>
      <button className="back" onClick={onVoltar}>
        ← Todos os clientes
      </button>
      <div className="panel">
        <section className="card">
          <div className="head">
            <div>
              <h2>{c.nome}</h2>
              <div
                className="sub"
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                {plats(c)}{" "}
                <span>
                  Semana de {dmy(c.periodo?.de)} a {dmy(c.periodo?.ate)} · atualizado{" "}
                  {quando(c.atualizado_em)}
                </span>
              </div>
            </div>
            <span className={"chip " + s[1]}>{s[0]}</span>
          </div>
          {(c.erro || (c.avisos ?? []).length > 0) && (
            <div className="msg err" style={{ marginTop: 12 }}>
              {c.erro ? "Última leitura falhou: " + c.erro : (c.avisos ?? []).join(" · ")}
            </div>
          )}
          <div style={{ margin: "14px 0 10px" }}>
            <BarraVis per={per} setPer={setPer} mets={mets} setMets={setMets} />
          </div>
          {j ? (
            <div className="kpis">
              {(mets.length ? mets : ["gasto"]).map((m) => (
                <div className="kpi" key={m}>
                  <div className="l">{nomeMet(m, c)}</div>
                  <div className="v num">{fmtMet(m, valorMet(j.atual, m), moeda)}</div>
                  {per === "hoje" ? (
                    <span className="var neutral">até a última atualização</span>
                  ) : j.ant ? (
                    valorMet(j.atual, m) != null ? (
                      <Variacao
                        a={valorMet(j.atual, m)!}
                        b={valorMet(j.ant, m)}
                        menor={!!MENOR[m]}
                        colorir={m !== "gasto" && m !== "impressoes"}
                        vs={PER_ANT[per] ?? ""}
                      />
                    ) : null
                  ) : (
                    <span className="var neutral">sem comparação</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="note">{PER[per]}: aparece na próxima atualização.</div>
          )}
        </section>

        {c.avaliacao && (
          <section className="card">
            <div className="aval">
              <div className={"nota " + notaK} title="Nota de 0 a 10">
                {nota == null ? "—" : String(nota).replace(".", ",")}
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: "0 0 2px" }}>Avaliação do gestor</h3>
                <div>{c.avaliacao.resumo}</div>
                <div className="cols">
                  <div className="ok">
                    <h4>O que está bom</h4>
                    {c.avaliacao.fortes.length ? (
                      <ul>
                        {c.avaliacao.fortes.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="note">Nada a destacar nesta semana.</div>
                    )}
                  </div>
                  <div className="mel">
                    <h4>O que melhorar</h4>
                    {c.avaliacao.melhorar.length ? (
                      <ul>
                        {c.avaliacao.melhorar.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="note">Nenhum ponto crítico.</div>
                    )}
                  </div>
                </div>
                {otimizaveis.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="b primary"
                      onClick={() => {
                        setTab("sugestoes");
                        setConfirmar(otimizaveis.map((x) => x.id));
                      }}
                    >
                      Otimizar este cliente
                    </button>{" "}
                    <span className="note">
                      {otimizaveis.length} melhoria(s) prontas para aplicar
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="two">
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Saldo</h3>
            {(c.saldo ?? []).map((x, i) => (
              <div key={i}>
                <GaugeSaldo s={x} moeda={moeda} />
                <div className="note" style={{ marginTop: 4 }}>
                  {x.modo}
                  {x.conta ? " · " + x.conta : ""}
                </div>
              </div>
            ))}
            <div className="note">
              A barra cheia equivale a 30 dias de saldo no ritmo atual. Os dias são uma estimativa
              pela média de gasto dos últimos 7 dias.
            </div>
          </section>
          <section className="card chart">
            <h3>Últimos 30 dias</h3>
            <div className="legend">
              {(c.plataformas ?? []).includes("Meta") && (
                <span>
                  <i style={{ background: "var(--sg-meta)" }} />
                  Investimento Meta
                </span>
              )}
              {(c.plataformas ?? []).includes("Google") && (
                <span>
                  <i style={{ background: "var(--sg-google)" }} />
                  Investimento Google
                </span>
              )}
              <span>
                <i style={{ background: "var(--sg-line2)" }} />
                Resultados por dia
              </span>
            </div>
            <Grafico c={c} />
          </section>
        </div>

        <section className="card">
          <h3>Campanhas · últimos 7 dias</h3>
          {(c.campanhas ?? []).length ? (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th className="r">Investido</th>
                    <th className="r">Resultado</th>
                    <th className="r">Custo</th>
                    <th className="r">Semana anterior</th>
                    <th className="r">Cliques</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.campanhas ?? []).map((x) => (
                    <tr key={x.plataforma + x.nome}>
                      <td>
                        <span className={"pl " + x.plataforma.toLowerCase()}>{x.plataforma}</span>{" "}
                        {x.nome}
                      </td>
                      <td className="r num">{brl(x.gasto, moeda)}</td>
                      <td className="r num">
                        {int(x.resultado)} {x.tipo === "Reconhecimento" ? "alcance" : x.unidade}
                      </td>
                      <td className="r num">
                        {x.tipo === "Reconhecimento" ? "—" : brl(x.custo, moeda)}
                      </td>
                      <td className="r num">
                        {x.tipo === "Reconhecimento" ? "—" : brl(x.custo_ant, moeda)}
                      </td>
                      <td className="r num">{int(x.cliques)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="note">Nenhuma campanha com gasto nas últimas duas semanas.</div>
          )}
        </section>

        <section className="card">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "sugestoes"}
              onClick={() => setTab("sugestoes")}
            >
              Melhorias sugeridas{pend.length ? ` (${pend.length})` : ""}
            </button>
            <button
              role="tab"
              aria-selected={tab === "campanha"}
              onClick={() => setTab("campanha")}
            >
              Subir campanha
              {campsPedidas.some((x) => ["pendente", "criando", "ativando"].includes(x.status))
                ? " •"
                : ""}
            </button>
            <button
              role="tab"
              aria-selected={tab === "alteracao"}
              onClick={() => setTab("alteracao")}
            >
              Pedir alteração
            </button>
          </div>

          {tab === "sugestoes" && (
            <>
              {itensConfirmar.length > 0 && (
                <div className="confirm" role="region" aria-label="Confirmar otimização">
                  <b>Confirme o que vou fazer em {c.nome}:</b>
                  <ol>
                    {itensConfirmar.map((x) => (
                      <li key={x.id}>
                        <b>{x.titulo}</b>
                        {x.orcamento && (
                          <>
                            {" "}
                            <span className="chip warn">mexe em orçamento</span>
                          </>
                        )}
                        <div className="exec">
                          {EXEC[x.execucao ?? ""] ?? ""}
                          {x.impacto ? " · Impacto esperado: " + x.impacto : ""}
                          {x.desfazer ? " · Como desfazer: " + x.desfazer : ""}
                        </div>
                        <PorQue s={x} aberto />
                      </li>
                    ))}
                  </ol>
                  {itensConfirmar.some((x) => x.orcamento) && (
                    <div className="msg info">Atenção: há item que mexe em quanto se gasta.</div>
                  )}
                  <div className="actions">
                    <button className="b primary" onClick={() => void otimizar(confirmar ?? [])}>
                      Confirmar e otimizar
                    </button>
                    <button className="b" onClick={() => setConfirmar(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="head" style={{ marginBottom: 6 }}>
                <div className="note">
                  Clique em Otimizar e confirme: o pedido vai para a fila do Claude, que aplica,
                  prepara ou analisa cada item e registra aqui o que mudou e como desfazer.
                </div>
                {otimizaveis.length > 1 && (
                  <button
                    className="b small primary"
                    onClick={() => setConfirmar(otimizaveis.map((x) => x.id))}
                  >
                    Otimizar tudo ({otimizaveis.length})
                  </button>
                )}
              </div>
              {!(c.sugestoes ?? []).length && (
                <div className="note">Nenhuma melhoria pendente para este cliente agora.</div>
              )}
              {(c.sugestoes ?? []).map((a) => {
                const o = pedidos.find(
                  (p) =>
                    p.chave === chaveSug(c, a) && (p.tipo === "otimizar" || p.tipo === "ignorar"),
                );
                const pr = a.prioridade.toLowerCase().includes("alta")
                  ? "alta"
                  : a.prioridade.toLowerCase().startsWith("m")
                    ? "media"
                    : "baixa";
                const sal =
                  a.execucao === "cliente"
                    ? (c.saldo ?? []).find((x) => a.titulo.includes(x.plataforma))
                    : undefined;
                const stt = o ? (ST[o.status] ?? ST["pendente"]!) : null;
                return (
                  <div className="sug" key={a.id}>
                    <span className={"pri " + pr} title={"Prioridade " + a.prioridade} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{a.titulo}</div>
                      <div className="w">
                        {a.plataforma && (
                          <>
                            <span className={"pl " + a.plataforma.toLowerCase()}>
                              {a.plataforma}
                            </span>{" "}
                          </>
                        )}
                        {a.campanha === "Conta" ? "Conta de anúncios" : a.campanha}
                        {a.orcamento && (
                          <>
                            {" "}
                            · <span className="chip warn">mexe em orçamento</span>
                          </>
                        )}
                      </div>
                      <div className="w" style={{ marginTop: 4 }}>
                        {a.motivo}
                      </div>
                      <PorQue s={a} />
                      {a.execucao && (
                        <div className="exec" style={{ marginTop: 4 }}>
                          Ao otimizar: {EXEC[a.execucao] ?? ""}
                        </div>
                      )}
                      {o?.resultado && (
                        <div
                          className={
                            "msg " +
                            (o.status === "feito" ? "ok" : o.status === "erro" ? "err" : "info")
                          }
                          style={{ marginTop: 6 }}
                        >
                          {o.resultado}
                          {o.desfazer && (
                            <>
                              <br />
                              <span className="note">Como desfazer: {o.desfazer}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="bt">
                      {sal ? (
                        <button
                          className="b small primary"
                          onClick={() => void copiar(avisoRecarga(c, sal))}
                        >
                          Copiar aviso ao cliente
                        </button>
                      ) : o && stt ? (
                        <>
                          <span className={"chip " + stt[1]}>{stt[0]}</span>
                          {(o.status === "ignorado" || o.status === "pendente") && (
                            <button className="b small" onClick={() => void apagar(o.id)}>
                              {o.status === "pendente" ? "Cancelar" : "Desfazer"}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button className="b small primary" onClick={() => setConfirmar([a.id])}>
                            Otimizar
                          </button>
                          <button className="b small" onClick={() => void ignorar(a)}>
                            Ignorar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <Historico
                pedidos={pedidos.filter((p) => p.tipo === "otimizar" || p.tipo === "alteracao")}
              />
            </>
          )}
          {tab === "campanha" && (
            <SubirCampanha c={c} pedidos={campsPedidas} avisar={avisar} recarregar={recarregar} />
          )}
          {tab === "alteracao" && (
            <PedirAlteracao
              c={c}
              pedidos={pedidos.filter((p) => p.tipo === "alteracao")}
              avisar={avisar}
              recarregar={recarregar}
            />
          )}
        </section>
      </div>
    </>
  );
}

function Historico({ pedidos }: { pedidos: Pedido[] }) {
  if (!pedidos.length) return null;
  return (
    <>
      <h3 style={{ marginTop: 18 }}>Pedidos deste cliente</h3>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>O que</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.slice(0, 12).map((o) => {
              const t = (ST[o.status] ?? ST["pendente"])!;
              const titulo =
                (o.dados?.["sugestao"] as Sug | undefined)?.titulo ??
                (o.dados?.["texto"] as string | undefined) ??
                o.tipo;
              return (
                <tr key={o.id}>
                  <td className="num">{quando(o.criado_em)}</td>
                  <td>
                    {titulo}
                    {o.resultado && <div className="note">{o.resultado}</div>}
                  </td>
                  <td>
                    <span className={"chip " + t[1]}>{t[0]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PedirAlteracao({
  c,
  pedidos,
  avisar,
  recarregar,
}: {
  c: Cartao;
  pedidos: Pedido[];
  avisar: (t: string, k?: string) => void;
  recarregar: () => void;
}) {
  const [texto, setTexto] = useState("");
  async function enviar() {
    if (texto.trim().length < 5) {
      avisar("Escreva o que você quer mudar.", "err");
      return;
    }
    const { error } = await db.from("gestor_pedidos").insert({
      client_id: c.id,
      tipo: "alteracao",
      status: "pendente",
      dados: { cliente: c.nome, contas: c.contas, texto: texto.trim() },
    });
    if (error) {
      avisar("Não consegui registrar o pedido. Tente de novo.", "err");
      return;
    }
    setTexto("");
    recarregar();
    avisar(
      "Pedido na fila do Claude. Ele te mostra o plano antes de mexer em qualquer coisa que não seja simples.",
    );
  }
  return (
    <>
      <div className="note" style={{ marginBottom: 8 }}>
        Escreva o que você quer mudar nas campanhas deste cliente. O pedido fica na fila do Claude,
        que registra aqui o que fez e como desfazer.
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <label className="full" htmlFor="alt-texto">
          O que mudar
          <textarea
            id="alt-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: pausar o anúncio do vídeo antigo e subir o orçamento da campanha de WhatsApp para R$ 40/dia"
          />
        </label>
        <div className="actions full">
          <button className="b primary" type="submit">
            Enviar ao Claude
          </button>
        </div>
      </form>
      {pedidos.length > 0 && <Historico pedidos={pedidos} />}
    </>
  );
}

type Rascunho = {
  plataforma: string;
  objetivo: string;
  orcamento_dia: string;
  inicio: string;
  fim: string;
  nome: string;
  regiao: string;
  idade_min: string;
  idade_max: string;
  genero: string;
  interesses: string;
  palavras: string;
  destino: string;
  texto: string;
  titulo: string;
  criativo_ref: string;
  obs: string;
};
type PedidoCampanha = Partial<Omit<Rascunho, "orcamento_dia">> & {
  orcamento_dia?: number;
  objetivo_txt?: string;
};

function SubirCampanha({
  c,
  pedidos,
  avisar,
  recarregar,
}: {
  c: Cartao;
  pedidos: Pedido[];
  avisar: (t: string, k?: string) => void;
  recarregar: () => void;
}) {
  const platsC = c.plataformas?.length ? c.plataformas : ["Meta"];
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const [d, setD] = useState<Rascunho>({
    plataforma: platsC[0]!,
    objetivo: "",
    orcamento_dia: "",
    inicio: iso(amanha),
    fim: "",
    nome: "",
    regiao: "",
    idade_min: "18",
    idade_max: "65",
    genero: "todos",
    interesses: "",
    palavras: "",
    destino: "",
    texto: "",
    titulo: "",
    criativo_ref: "",
    obs: "",
  });
  const [revisar, setRevisar] = useState(false);
  const [ativar, setAtivar] = useState<Pedido | null>(null);
  const pl = d.plataforma === "Google" ? "Google" : "Meta";
  const objs = OBJ[pl]!;
  const objetivo = d.objetivo || objs[0]![0];
  const objetivoTxt = objs.find((o) => o[0] === objetivo)?.[1] ?? objetivo;
  const set = (k: keyof Rascunho) => (e: { target: { value: string } }) =>
    setD({ ...d, [k]: e.target.value });

  function conferir() {
    if (!(Number(d.orcamento_dia) >= 5)) {
      avisar("Informe um orçamento diário de pelo menos R$ 5.", "err");
      return;
    }
    if (!d.regiao.trim()) {
      avisar("Informe a região.", "err");
      return;
    }
    if (d.fim && d.fim < d.inicio) {
      avisar("A data de fim precisa ser depois do início.", "err");
      return;
    }
    setRevisar(true);
  }
  async function enviar() {
    const contas = pl === "Meta" ? c.contas?.meta : c.contas?.google;
    const { error } = await db.from("gestor_pedidos").insert({
      client_id: c.id,
      tipo: "campanha",
      status: "pendente",
      dados: {
        ...d,
        objetivo,
        objetivo_txt: objetivoTxt,
        orcamento_dia: Number(d.orcamento_dia),
        cliente: c.nome,
        conta: contas,
      },
    });
    if (error) {
      avisar("Não consegui registrar o pedido. Tente de novo.", "err");
      return;
    }
    setRevisar(false);
    recarregar();
    avisar(
      "Pedido na fila do Claude. Ele cria a campanha pausada e avisa aqui quando estiver pronta para você revisar.",
    );
  }
  async function confirmarAtivar(p: Pedido) {
    const { error } = await db
      .from("gestor_pedidos")
      .update({ status: "ativando", atualizado_em: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      avisar("Não consegui salvar. Tente de novo.", "err");
      return;
    }
    setAtivar(null);
    recarregar();
    avisar("Ativação na fila do Claude.");
  }

  const lista = pedidos.length > 0 && (
    <>
      <h3 style={{ marginTop: 18 }}>Campanhas pedidas por aqui</h3>
      {pedidos.slice(0, 10).map((x) => {
        const t = (ST_CAMP[x.status] ?? ST_CAMP["pendente"])!,
          dd = x.dados as PedidoCampanha;
        return (
          <div className="sug" key={x.id}>
            <span />
            <div style={{ minWidth: 0 }}>
              <div className="t">{dd.nome || dd.objetivo_txt}</div>
              <div className="w">
                <span className={"pl " + String(dd.plataforma).toLowerCase()}>{dd.plataforma}</span>{" "}
                {dd.objetivo_txt} · {brl(Number(dd.orcamento_dia), c.moeda)}/dia · pedido{" "}
                {quando(x.criado_em)}
              </div>
              {x.resultado && (
                <div
                  className={
                    "msg " +
                    (x.status === "erro" ? "err" : x.status === "precisa_voce" ? "info" : "ok")
                  }
                  style={{ marginTop: 6 }}
                >
                  {x.resultado}
                  {x.link && (
                    <>
                      <br />
                      <a href={x.link} target="_blank" rel="noopener noreferrer">
                        Abrir no gerenciador
                      </a>
                    </>
                  )}
                  {x.desfazer && (
                    <>
                      <br />
                      <span className="note">Como desfazer: {x.desfazer}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="bt">
              <span className={"chip " + t[1]}>{t[0]}</span>
              {x.status === "criada" && (
                <button className="b small primary" onClick={() => setAtivar(x)}>
                  Ativar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
  const confAtivar = ativar && (
    <div className="confirm">
      <b>
        Colocar no ar "
        {(ativar.dados as PedidoCampanha).nome || (ativar.dados as PedidoCampanha).objetivo_txt}"?
      </b>
      <div>
        A campanha começa a gastar até{" "}
        {brl(Number((ativar.dados as PedidoCampanha).orcamento_dia), c.moeda)} por dia
        {(ativar.dados as PedidoCampanha).fim
          ? ` até ${dmy((ativar.dados as PedidoCampanha).fim)}`
          : ", sem data de fim"}
        . Para parar, é só pedir ou pausar no gerenciador.
      </div>
      <div className="actions">
        <button className="b primary" onClick={() => void confirmarAtivar(ativar)}>
          Confirmar e ativar
        </button>
        <button className="b" onClick={() => setAtivar(null)}>
          Cancelar
        </button>
      </div>
    </div>
  );

  if (revisar) {
    const linha = (k: string, v?: string | null): ReactNode =>
      v ? (
        <>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </>
      ) : null;
    return (
      <>
        {confAtivar}
        <div className="confirm">
          <b>Confira o pedido de campanha para {c.nome}:</b>
          <dl className="resumo">
            {linha("Plataforma", pl)}
            {linha("Objetivo", objetivoTxt)}
            {linha("Nome", d.nome || "o Claude segue o padrão [AGT] da agência")}
            {linha("Orçamento", brl(Number(d.orcamento_dia), c.moeda) + " por dia")}
            {linha("Período", dmy(d.inicio) + (d.fim ? " até " + dmy(d.fim) : ", sem data de fim"))}
            {linha("Região", d.regiao)}
            {pl === "Meta" &&
              linha(
                "Público",
                [
                  `${d.idade_min} a ${d.idade_max} anos`,
                  d.genero !== "todos" ? d.genero : "",
                  d.interesses,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}
            {linha("Palavras-chave", d.palavras)}
            {linha("Destino", d.destino)}
            {linha("Texto do anúncio", d.texto)}
            {linha("Título", d.titulo)}
            {linha(
              "Criativos",
              d.criativo_ref || "nenhum: o Claude pede antes de montar os anúncios",
            )}
            {linha("Observações", d.obs)}
          </dl>
          <div className="note">
            A campanha nasce <b>pausada</b>
            {pl === "Meta" ? ", com a expansão de público além da região desligada" : ""} e com o
            pixel certo da conta. Nada gasta até você clicar em Ativar aqui.
          </div>
          <div className="actions">
            <button className="b primary" onClick={() => void enviar()}>
              Confirmar e criar pausada
            </button>
            <button className="b" onClick={() => setRevisar(false)}>
              Voltar e editar
            </button>
          </div>
        </div>
        {lista}
      </>
    );
  }
  return (
    <>
      {confAtivar}
      <div className="note" style={{ marginBottom: 8 }}>
        Preencha o básico e o Claude monta a campanha. Ela nasce pausada; você revisa e ativa por
        aqui.
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          conferir();
        }}
      >
        <label htmlFor="c-pl">
          Plataforma
          <select
            id="c-pl"
            value={pl}
            onChange={(e) => setD({ ...d, plataforma: e.target.value, objetivo: "" })}
          >
            {platsC.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label htmlFor="c-obj">
          Objetivo
          <select id="c-obj" value={objetivo} onChange={set("objetivo")}>
            {objs.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="c-orc">
          Orçamento por dia (R$)
          <input
            id="c-orc"
            type="number"
            min={5}
            step={1}
            required
            value={d.orcamento_dia}
            onChange={set("orcamento_dia")}
          />
        </label>
        <label htmlFor="c-ini">
          Início
          <input
            id="c-ini"
            type="date"
            required
            min={iso(new Date())}
            value={d.inicio}
            onChange={set("inicio")}
          />
        </label>
        <label htmlFor="c-fim">
          Fim (opcional)
          <input id="c-fim" type="date" value={d.fim} onChange={set("fim")} />
        </label>
        <label htmlFor="c-nome">
          Nome (opcional)
          <input
            id="c-nome"
            placeholder="Padrão [AGT] da agência"
            value={d.nome}
            onChange={set("nome")}
          />
        </label>
        <label className="full" htmlFor="c-reg">
          Região
          <input
            id="c-reg"
            required
            placeholder="Ex.: Agudos e Bauru (raio de 15 km) ou SP, PR"
            value={d.regiao}
            onChange={set("regiao")}
          />
          <span className="dica">
            {pl === "Meta"
              ? "A expansão de público além da região fica desligada."
              : "Mostra só para quem está na região."}
          </span>
        </label>
        {pl === "Meta" ? (
          <>
            <label htmlFor="c-imin">
              Idade mínima
              <input
                id="c-imin"
                type="number"
                min={18}
                max={65}
                value={d.idade_min}
                onChange={set("idade_min")}
              />
            </label>
            <label htmlFor="c-imax">
              Idade máxima
              <input
                id="c-imax"
                type="number"
                min={18}
                max={65}
                value={d.idade_max}
                onChange={set("idade_max")}
              />
            </label>
            <label htmlFor="c-gen">
              Gênero
              <select id="c-gen" value={d.genero} onChange={set("genero")}>
                {["todos", "mulheres", "homens"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="full" htmlFor="c-int">
              Interesses (opcional)
              <input
                id="c-int"
                placeholder="Ex.: churrasco, carnes, cervejas artesanais"
                value={d.interesses}
                onChange={set("interesses")}
              />
            </label>
          </>
        ) : (
          <label className="full" htmlFor="c-pal">
            Palavras-chave
            <textarea
              id="c-pal"
              placeholder="Uma por linha. Se deixar vazio, o Claude propõe a lista e te mostra antes."
              value={d.palavras}
              onChange={set("palavras")}
            />
          </label>
        )}
        <label className="full" htmlFor="c-dest">
          Para onde o anúncio leva
          <input
            id="c-dest"
            placeholder={
              pl === "Meta"
                ? "Ex.: WhatsApp (14) 99999-9999, site ou perfil do Instagram"
                : "Ex.: https://site.com.br/pagina"
            }
            value={d.destino}
            onChange={set("destino")}
          />
        </label>
        <label className="full" htmlFor="c-txt">
          Texto do anúncio (opcional)
          <textarea
            id="c-txt"
            placeholder="Se deixar vazio, o Claude escreve e você vê antes de ativar."
            value={d.texto}
            onChange={set("texto")}
          />
        </label>
        <label className="full" htmlFor="c-tit">
          Título (opcional)
          <input id="c-tit" value={d.titulo} onChange={set("titulo")} />
        </label>
        <label className="full" htmlFor="c-ref">
          Criativo (opcional)
          <input
            id="c-ref"
            placeholder="Link do Drive com imagens/vídeos ou o criativo de outra campanha"
            value={d.criativo_ref}
            onChange={set("criativo_ref")}
          />
        </label>
        <label className="full" htmlFor="c-obs">
          Observações
          <textarea
            id="c-obs"
            placeholder="Oferta, promoção, horário, o que não pode faltar..."
            value={d.obs}
            onChange={set("obs")}
          />
        </label>
        <div className="actions full">
          <button className="b primary" type="submit">
            Revisar pedido
          </button>
        </div>
      </form>
      {lista}
    </>
  );
}
