/**
 * Server-only: the ads currently running on a client's Meta accounts, with creative (image, title,
 * text, call to action) and the last 30 days of results, for the "Criativos ativos" page / PDF.
 */
import { agencyTokens } from "./report-data.server";

const GRAPH = "https://graph.facebook.com/v24.0/";

export type ActiveAd = {
  id: string;
  name: string;
  account: string;
  campaign: string;
  adset: string;
  image: string | null;
  format: "imagem" | "vídeo" | "carrossel" | "dinâmico" | "outro";
  title: string | null;
  body: string | null;
  cta: string | null;
  link: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
};

type Story = {
  link_data?: { message?: string; name?: string; description?: string; link?: string; picture?: string; call_to_action?: { type?: string }; child_attachments?: Array<{ picture?: string; name?: string }> };
  video_data?: { message?: string; title?: string; image_url?: string; call_to_action?: { type?: string; value?: { link?: string } } };
  photo_data?: { url?: string; caption?: string };
};
type Creative = {
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  object_story_spec?: Story;
  asset_feed_spec?: { bodies?: Array<{ text?: string }>; titles?: Array<{ text?: string }>; images?: Array<{ url?: string }>; videos?: Array<{ thumbnail_url?: string }>; call_to_action_types?: string[]; link_urls?: Array<{ website_url?: string }> };
};
type AdRow = { id: string; name?: string; campaign?: { name?: string }; adset?: { name?: string }; creative?: Creative };

const CTA: Record<string, string> = {
  LEARN_MORE: "Saiba mais", SHOP_NOW: "Comprar agora", SIGN_UP: "Cadastre-se", CONTACT_US: "Fale conosco", MESSAGE_PAGE: "Enviar mensagem",
  WHATSAPP_MESSAGE: "Enviar mensagem (WhatsApp)", SEND_MESSAGE: "Enviar mensagem", GET_QUOTE: "Solicitar orçamento", BOOK_TRAVEL: "Reservar",
  APPLY_NOW: "Inscreva-se", CALL_NOW: "Ligar agora", GET_OFFER: "Obter oferta", SUBSCRIBE: "Assinar", DOWNLOAD: "Baixar", ORDER_NOW: "Peça agora",
  BUY_NOW: "Comprar", SEE_MORE: "Ver mais", WATCH_MORE: "Assistir", GET_DIRECTIONS: "Como chegar", NO_BUTTON: "Sem botão", INSTAGRAM_MESSAGE: "Enviar mensagem (Instagram)",
};
const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const MSG = ["onsite_conversion.messaging_conversation_started_7d"];
const BUY = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const best = (list: unknown, types: string[]) => {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const t of types) {
    const a = list.find((x: { action_type?: string }) => x.action_type === t) as { value?: string } | undefined;
    if (a) n = Math.max(n, Number(a.value ?? 0));
  }
  return n;
};

async function pages<T>(url: string, token: string, max = 10): Promise<T[]> {
  const out: T[] = [];
  let next = url;
  for (let i = 0; i < max && next; i++) {
    const res = await fetch(next, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { data?: T[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok) throw new Error(body.error?.message || "Erro na Meta (" + res.status + ")");
    out.push(...(body.data ?? []));
    next = body.paging?.next && body.paging.next.startsWith("https://graph.facebook.com/") ? body.paging.next : "";
  }
  return out;
}

function describe(c: Creative | undefined) {
  const s = c?.object_story_spec;
  const f = c?.asset_feed_spec;
  const image =
    c?.image_url || s?.link_data?.picture || s?.link_data?.child_attachments?.find((x) => x.picture)?.picture || s?.video_data?.image_url || s?.photo_data?.url || f?.images?.find((x) => x.url)?.url || f?.videos?.find((x) => x.thumbnail_url)?.thumbnail_url || c?.thumbnail_url || null;
  const format: ActiveAd["format"] = f ? "dinâmico" : s?.link_data?.child_attachments?.length ? "carrossel" : s?.video_data ? "vídeo" : s?.link_data || s?.photo_data || c?.image_url ? "imagem" : "outro";
  const ctaType = c?.call_to_action_type || s?.link_data?.call_to_action?.type || s?.video_data?.call_to_action?.type || f?.call_to_action_types?.[0] || null;
  return {
    image,
    format,
    title: c?.title || s?.link_data?.name || s?.video_data?.title || f?.titles?.[0]?.text || null,
    body: c?.body || s?.link_data?.message || s?.video_data?.message || s?.photo_data?.caption || f?.bodies?.[0]?.text || null,
    cta: ctaType ? CTA[ctaType] ?? ctaType.replace(/_/g, " ").toLowerCase() : null,
    link: s?.link_data?.link || s?.video_data?.call_to_action?.value?.link || f?.link_urls?.[0]?.website_url || null,
  };
}

export async function listActiveAds(accounts: Array<{ provider: string; account_id: string; account_name: string }>) {
  const token = (await agencyTokens()).meta;
  const metaAccounts = accounts.filter((a) => a.provider === "meta");
  const errors: string[] = [];
  const ads: ActiveAd[] = [];
  if (!metaAccounts.length) return { ads, errors: ["Este cliente não tem conta da Meta vinculada."] };
  if (!token) return { ads, errors: ["Meta Ads não conectado. Conecte em Integrações."] };
  const creativeFields = "creative.thumbnail_width(600).thumbnail_height(600){title,body,image_url,thumbnail_url,call_to_action_type,object_story_spec,asset_feed_spec}";
  const active = encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]));
  await Promise.all(
    metaAccounts.map(async (a) => {
      try {
        const [rows, stats] = await Promise.all([
          pages<AdRow>(`${GRAPH}${a.account_id}/ads?fields=${encodeURIComponent("id,name,campaign{name},adset{name}," + creativeFields)}&filtering=${active}&limit=50`, token, 6).catch(() =>
            pages<AdRow>(`${GRAPH}${a.account_id}/ads?fields=${encodeURIComponent("id,name,campaign{name},adset{name},creative{title,body,image_url,thumbnail_url,call_to_action_type,object_story_spec,asset_feed_spec}")}&filtering=${active}&limit=50`, token, 6),
          ),
          pages<Record<string, unknown>>(`${GRAPH}${a.account_id}/insights?level=ad&date_preset=last_30d&fields=ad_id,spend,impressions,clicks,actions&limit=200`, token, 5).catch(() => []),
        ]);
        const byAd = new Map(stats.map((s) => [String(s["ad_id"] ?? ""), s]));
        for (const r of rows) {
          const st = byAd.get(r.id);
          ads.push({
            id: r.id,
            name: r.name ?? "Anúncio",
            account: a.account_name,
            campaign: r.campaign?.name ?? "Campanha",
            adset: r.adset?.name ?? "",
            ...describe(r.creative),
            spend: Number(st?.["spend"] ?? 0),
            impressions: Number(st?.["impressions"] ?? 0),
            clicks: Number(st?.["clicks"] ?? 0),
            results: best(st?.["actions"], LEAD) + best(st?.["actions"], MSG) + best(st?.["actions"], BUY),
          });
        }
      } catch (e) {
        errors.push(`${a.account_name}: ${e instanceof Error ? e.message : "falha na consulta"}`);
      }
    }),
  );
  ads.sort((x, y) => x.campaign.localeCompare(y.campaign, "pt-BR") || y.spend - x.spend);
  return { ads, errors };
}
