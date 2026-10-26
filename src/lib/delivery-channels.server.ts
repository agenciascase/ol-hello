/**
 * Server-only: e-mail and WhatsApp delivery settings.
 * Connected from the Integrations page (encrypted in delivery_channels); environment Secrets remain a fallback.
 */
import { decryptToken, encryptToken } from "./ads-credentials.server";

export type EmailConfig = { apiKey: string; from: string };
export type WhatsAppConfig =
  | { provider: "meta"; token: string; phoneNumberId: string; templateName: string; language: string; documentHeader: boolean }
  | { provider: "zapi"; instanceId: string; token: string; clientToken: string };
export type Channel = "email" | "whatsapp";
export type ChannelPublic = { connected: boolean; source: "plataforma" | "secrets" | null; info: Record<string, string>; updatedAt: string | null };

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const env = (k: string) => process.env[k] ?? "";

function envEmail(): EmailConfig | null {
  return env("RESEND_API_KEY") && env("REPORT_EMAIL_FROM") ? { apiKey: env("RESEND_API_KEY"), from: env("REPORT_EMAIL_FROM") } : null;
}
function envWhatsApp(): WhatsAppConfig | null {
  if ((env("WHATSAPP_PROVIDER") || "meta") === "zapi")
    return env("ZAPI_INSTANCE_ID") && env("ZAPI_TOKEN") ? { provider: "zapi", instanceId: env("ZAPI_INSTANCE_ID"), token: env("ZAPI_TOKEN"), clientToken: env("ZAPI_CLIENT_TOKEN") } : null;
  return env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_TEMPLATE_NAME")
    ? {
        provider: "meta",
        token: env("WHATSAPP_TOKEN"),
        phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
        templateName: env("WHATSAPP_TEMPLATE_NAME"),
        language: env("WHATSAPP_TEMPLATE_LANGUAGE") || "pt_BR",
        documentHeader: env("WHATSAPP_TEMPLATE_DOCUMENT_HEADER") === "true",
      }
    : null;
}

type Row = { channel: Channel; config_ciphertext: string; public_info: Record<string, string>; updated_at: string };

async function rows(): Promise<Row[]> {
  const db = await admin();
  const { data } = await db.from("delivery_channels").select("channel,config_ciphertext,public_info,updated_at");
  return (data ?? []) as unknown as Row[];
}

/** Settings used to send reports: connected channel first, environment Secrets as fallback. */
export async function loadChannels(): Promise<{ email: EmailConfig | null; whatsapp: WhatsAppConfig | null }> {
  const list = await rows().catch(() => [] as Row[]);
  const read = <T,>(c: Channel): T | null => {
    const r = list.find((x) => x.channel === c);
    if (!r) return null;
    try {
      return JSON.parse(decryptToken(r.config_ciphertext)) as T;
    } catch {
      return null;
    }
  };
  return { email: read<EmailConfig>("email") ?? envEmail(), whatsapp: read<WhatsAppConfig>("whatsapp") ?? envWhatsApp() };
}

/** What the Integrations page may show: never a key or token. */
export async function channelsPublic(): Promise<Record<Channel, ChannelPublic>> {
  const list = await rows().catch(() => [] as Row[]);
  const of = (c: Channel, fallback: Record<string, string> | null): ChannelPublic => {
    const r = list.find((x) => x.channel === c);
    if (r) return { connected: true, source: "plataforma", info: r.public_info ?? {}, updatedAt: r.updated_at };
    if (fallback) return { connected: true, source: "secrets", info: fallback, updatedAt: null };
    return { connected: false, source: null, info: {}, updatedAt: null };
  };
  const e = envEmail();
  const w = envWhatsApp();
  return {
    email: of("email", e ? { from: e.from } : null),
    whatsapp: of("whatsapp", w ? { provider: w.provider === "zapi" ? "Z-API" : "API oficial da Meta" } : null),
  };
}

export async function saveChannel(channel: Channel, config: EmailConfig | WhatsAppConfig, info: Record<string, string>, userId: string | null) {
  const db = await admin();
  const { error } = await db
    .from("delivery_channels")
    .upsert({ channel, config_ciphertext: encryptToken(JSON.stringify(config)), public_info: info, updated_by: userId, updated_at: new Date().toISOString() } as never);
  if (error) throw new Error("Não foi possível salvar a conexão.");
}

export async function removeChannel(channel: Channel) {
  const db = await admin();
  const { error } = await db.from("delivery_channels").delete().eq("channel", channel);
  if (error) throw new Error("Não foi possível desconectar.");
}

/* ───────────── Senders ───────────── */

export async function sendEmailWith(cfg: EmailConfig, to: string[], subject: string, html: string, attachment?: { filename: string; content: Uint8Array }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to, subject, html, ...(attachment ? { attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.content).toString("base64") }] } : {}) }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error("O provedor de e-mail recusou o envio (" + res.status + ")" + (body.message ? ": " + body.message : ""));
  }
}

/** Checks WhatsApp credentials and returns the connected number, when the provider exposes it. */
export async function verifyWhatsApp(cfg: WhatsAppConfig): Promise<string | null> {
  if (cfg.provider === "zapi") {
    const res = await fetch(`https://api.z-api.io/instances/${encodeURIComponent(cfg.instanceId)}/token/${encodeURIComponent(cfg.token)}/status`, {
      headers: cfg.clientToken ? { "Client-Token": cfg.clientToken } : {},
      cache: "no-store",
    });
    if (!res.ok) throw new Error("A Z-API não aceitou a instância e o token informados (" + res.status + ").");
    const body = (await res.json().catch(() => ({}))) as { connected?: boolean };
    if (body.connected === false) throw new Error("A instância da Z-API existe, mas o WhatsApp não está conectado. Leia o QR Code no painel da Z-API.");
    return null;
  }
  const res = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(cfg.phoneNumberId)}?fields=display_phone_number,verified_name`, {
    headers: { authorization: "Bearer " + cfg.token },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  if (!res.ok) throw new Error("A Meta não aceitou o token e o ID do número: " + (body.error?.message ?? res.status));
  return [body.verified_name, body.display_phone_number].filter(Boolean).join(" · ") || null;
}
