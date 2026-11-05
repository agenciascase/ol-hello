/**
 * WhatsApp pelo QR Code: conexão própria do HUB (sem custo), com a biblioteca Baileys
 * (a mesma tecnologia do WhatsApp Web). Serve para enviar relatórios em GRUPOS.
 *
 * - A sessão fica em arquivos no servidor, fora do site: HUB_WHATSAPP_DIR (padrão ~/hub-whatsapp/sessao),
 *   com permissão só do dono. Quem tem esses arquivos tem acesso ao WhatsApp conectado.
 * - Uma conexão por servidor. Se o processo reiniciar, reconecta sozinho com a sessão salva.
 * - Desconectar no celular (Aparelhos conectados) ou pelo HUB apaga a sessão.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type EstadoWhatsApp = "desconectado" | "conectando" | "aguardando_qr" | "conectado";

let sock: any = null;
let estado: EstadoWhatsApp = "desconectado";
let qrImagem: string | null = null;
let numero: string | null = null;
let ultimoErro: string | null = null;
let abrindo: Promise<void> | null = null;
let tentativas = 0;
let grupos: { quando: number; lista: GrupoWhatsApp[] } | null = null;

export type GrupoWhatsApp = { id: string; nome: string; participantes: number };

async function pasta() {
  const [{ homedir }, { join }] = await Promise.all([import("node:os"), import("node:path")]);
  return process.env["HUB_WHATSAPP_DIR"] || join(homedir(), "hub-whatsapp", "sessao");
}

export async function temSessao() {
  const [{ access }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  return access(join(await pasta(), "creds.json"))
    .then(() => true)
    .catch(() => false);
}

async function apagarSessao() {
  const { rm } = await import("node:fs/promises");
  await rm(await pasta(), { recursive: true, force: true });
}

const formatarNumero = (n: string | null) => {
  if (!n) return null;
  const d = n.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12
    ? `+55 ${d.slice(2, 4)} ${d.slice(4, d.length - 4)}-${d.slice(-4)}`
    : "+" + d;
};

export function situacao() {
  return { estado, qr: qrImagem, numero: formatarNumero(numero), erro: ultimoErro };
}

/** Abre a conexão (com a sessão salva ou mostrando um QR Code novo). */
export async function conectar(): Promise<void> {
  if (estado === "conectado" && sock) return;
  if (abrindo) return abrindo;
  abrindo = (async () => {
    const baileys: any = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.makeWASocket ?? baileys.default;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
    const [{ mkdir, chmod }, QRCode, pino] = await Promise.all([
      import("node:fs/promises"),
      import("qrcode"),
      import("pino"),
    ]);
    const dir = await pasta();
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700).catch(() => undefined);
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const versao = await fetchLatestBaileysVersion()
      .then((v: any) => v?.version)
      .catch(() => undefined);
    estado = "conectando";
    ultimoErro = null;
    let qrMostrado = false;
    const s = makeWASocket({
      auth: state,
      ...(versao ? { version: versao } : {}),
      browser: ["SCASE HUB", "Chrome", "1.0"],
      logger: (pino.default ?? pino)({ level: "silent" }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false,
    });
    sock = s;
    s.ev.on("creds.update", saveCreds);
    s.ev.on("connection.update", async (u: any) => {
      if (u.qr) {
        qrMostrado = true;
        estado = "aguardando_qr";
        qrImagem = await (QRCode.default ?? QRCode).toDataURL(u.qr, { margin: 1, width: 300 });
      }
      if (u.connection === "open") {
        estado = "conectado";
        qrImagem = null;
        ultimoErro = null;
        tentativas = 0;
        numero =
          String(s.user?.id ?? "")
            .split(":")[0]
            ?.split("@")[0] || null;
      }
      if (u.connection === "close") {
        const codigo = u.lastDisconnect?.error?.output?.statusCode;
        if (sock === s) sock = null;
        qrImagem = null;
        if (codigo === DisconnectReason.loggedOut) {
          estado = "desconectado";
          numero = null;
          grupos = null;
          ultimoErro = "O WhatsApp foi desconectado no celular. Conecte de novo pelo QR Code.";
          await apagarSessao();
          return;
        }
        if (codigo === DisconnectReason.restartRequired) {
          // normal logo depois de ler o QR Code: abre de novo já com a sessão
          estado = "conectando";
          setTimeout(() => void conectar(), 300);
          return;
        }
        estado = "desconectado";
        if (await temSessao()) {
          // queda de rede ou reinício do WhatsApp: tenta de novo com espera crescente
          tentativas++;
          ultimoErro = tentativas > 3 ? `Conexão instável (código ${codigo ?? "?"}).` : null;
          if (tentativas <= 8)
            setTimeout(() => void conectar(), Math.min(60_000, 3_000 * tentativas));
        } else if (qrMostrado && codigo === DisconnectReason.timedOut) {
          ultimoErro = "O QR Code expirou. Clique em Gerar QR Code de novo.";
        } else if (!qrMostrado) {
          ultimoErro = `Não consegui falar com o WhatsApp (código ${codigo ?? "?"}). Tente de novo em instantes.`;
        } else {
          ultimoErro = `Não consegui conectar (código ${codigo ?? "?"}).`;
        }
      }
    });
  })().finally(() => {
    abrindo = null;
  });
  return abrindo;
}

/** Garante a conexão (usando a sessão salva) e espera até ficar pronta. */
export async function garantirConexao(esperaMs = 25_000) {
  if (estado === "conectado" && sock) return sock;
  if (!(await temSessao()))
    throw new Error("WhatsApp pelo QR Code não está conectado. Conecte em Integrações.");
  await conectar();
  const fim = Date.now() + esperaMs;
  while (Date.now() < fim) {
    if (estado === "conectado" && sock) return sock;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("O WhatsApp não respondeu a tempo. Confira se o celular está com internet.");
}

export async function desconectar() {
  try {
    if (sock) await sock.logout().catch(() => undefined);
  } finally {
    sock = null;
    estado = "desconectado";
    numero = null;
    qrImagem = null;
    grupos = null;
    ultimoErro = null;
    await apagarSessao();
  }
}

/** Grupos em que o número conectado participa (guarda por 2 minutos). */
export async function listarGrupos(forcar = false): Promise<GrupoWhatsApp[]> {
  if (!forcar && grupos && Date.now() - grupos.quando < 120_000) return grupos.lista;
  const s = await garantirConexao();
  const todos = (await s.groupFetchAllParticipating()) as Record<string, any>;
  const lista = Object.values(todos)
    .map((g: any) => ({
      id: String(g.id),
      nome: String(g.subject || "Grupo sem nome"),
      participantes: Array.isArray(g.participants) ? g.participants.length : 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  grupos = { quando: Date.now(), lista };
  return lista;
}

/** Envia o PDF para um grupo (id terminado em @g.us) ou para um número. Devolve o nome de quem recebeu. */
export async function enviarDocumento(
  destino: string,
  pdf: Uint8Array,
  nomeArquivo: string,
  legenda: string,
) {
  const s = await garantirConexao();
  let jid: string;
  let rotulo = destino;
  if (destino.endsWith("@g.us")) {
    jid = destino;
    const g = grupos?.lista.find((x) => x.id === destino);
    rotulo = g ? `Grupo ${g.nome}` : "Grupo";
    if (!g) {
      const meta = await s.groupMetadata(destino).catch(() => null);
      if (!meta)
        throw new Error("Grupo não encontrado: o número conectado não participa mais dele.");
      rotulo = `Grupo ${meta.subject}`;
    }
  } else {
    let d = destino.replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    const [r] = (await s.onWhatsApp(d)) ?? [];
    if (!r?.exists) throw new Error(`O número ${destino} não tem WhatsApp.`);
    jid = r.jid;
  }
  await s.sendMessage(jid, {
    document: Buffer.from(pdf),
    mimetype: "application/pdf",
    fileName: nomeArquivo,
    caption: legenda,
  });
  return rotulo;
}
