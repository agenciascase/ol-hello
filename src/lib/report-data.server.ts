/** Server-only: fetches real Meta/Google data for report configurations. Tokens never leave the server. */
import { decryptToken, encryptToken } from "./ads-credentials.server";
import { googleAdsVersion, googleHeaders, MCC_CUSTOMER_ID, META_BUSINESS_ID, metaTokenLifetime, refreshGoogleToken } from "./ads-oauth.server";
import { resolvePeriod, type ReportPeriod } from "./report-schedule";
import type { ReportTotals } from "./report-metrics";
import {
  ALL_SECTIONS,
  buildHighlights,
  evaluateGoals,
  evaluatePacing,
  isObjective,
  spendWithTaxes,
  type Audience,
  type AudienceRow,
  type CampaignRow,
  type ConversionType,
  type Creative,
  type DailyPoint,
  type FullReport,
  type MonthPoint,
  type Platform,
  type SearchTerm,
  type SectionKey,
} from "./report-insights";

export { googleHeaders };
export type Totals = ReportTotals;
export type { CampaignRow };
export type BuiltReport = FullReport;

const GRAPH = "https://graph.facebook.com/v24.0/";
const CACHE_MAX_AGE_MS = 30 * 60_000;
const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, leads: null, reach: null });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Agency-level tokens (the most recently authorized admin connection per provider). */
export async function agencyTokens() {
  const db = await admin();
  const { data, error } = await db
    .from("ads_connections")
    .select("provider,owner_id,access_token_ciphertext,refresh_token_ciphertext,expires_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Credenciais indisponíveis");
  const rows = (data ?? []) as unknown as Array<{ provider: string; owner_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string | null; expires_at: string }>;
  const out: { meta?: string; google?: string } = {};
  const meta = rows.find((r) => r.provider === "meta");
  if (meta) {
    const token = decryptToken(meta.access_token_ciphertext);
    if (Date.parse(meta.expires_at) > Date.now() + 60000) out.meta = token;
    else {
      // Stored expiry may be wrong for long-lived tokens: confirm with Meta and repair the record.
      const lifetime = await metaTokenLifetime(token).catch(() => null);
      if (lifetime) {
        out.meta = token;
        await db
          .from("ads_connections")
          .update({ expires_at: new Date(Date.now() + lifetime * 1000).toISOString() } as never)
          .eq("provider", "meta")
          .eq("owner_id", meta.owner_id);
      }
    }
  }
  const g = rows.find((r) => r.provider === "google");
  if (g) {
    if (Date.parse(g.expires_at) > Date.now() + 60000) out.google = decryptToken(g.access_token_ciphertext);
    else if (g.refresh_token_ciphertext) {
      const fresh = await refreshGoogleToken(decryptToken(g.refresh_token_ciphertext));
      out.google = fresh.access_token;
      await db
        .from("ads_connections")
        .update({ access_token_ciphertext: encryptToken(fresh.access_token), expires_at: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString() } as never)
        .eq("provider", "google")
        .eq("owner_id", g.owner_id);
    }
  }
  return out;
}

/* ───────────────────────────── Meta ───────────────────────────── */

type Row = Record<string, unknown>;

async function graphPages(url: string, token: string, max = 30) {
  const rows: Row[] = [];
  let next = url;
  for (let i = 0; i < max && next; i++) {
    const res = await fetch(next, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const body = (await res.json()) as { data?: Row[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok) throw new Error(body.error?.message || "Erro na Meta (" + res.status + ")");
    rows.push(...(body.data ?? []));
    const n = body.paging?.next;
    next = n && n.startsWith(GRAPH.slice(0, 27)) ? n : "";
  }
  return rows;
}

export async function syncMetaCatalog(token: string) {
  const fields = "id,name,account_id,currency,account_status";
  const all = new Map<string, { account_id: string; name: string; currency: string; status: string }>();
  for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
    const rows = await graphPages(`${GRAPH}${META_BUSINESS_ID}/${edge}?fields=${fields}&limit=100`, token);
    for (const r of rows) {
      const id = String(r["id"] ?? "");
      if (!/^act_\d+$/.test(id)) continue;
      const st = Number(r["account_status"] ?? 0);
      all.set(id, { account_id: id, name: String(r["name"] ?? id), currency: String(r["currency"] ?? ""), status: st === 1 ? "ACTIVE" : st === 2 ? "DISABLED" : st === 101 ? "CLOSED" : "STATUS_" + st });
    }
  }
  return [...all.values()];
}

const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const PURCHASE = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const MESSAGING = ["onsite_conversion.messaging_conversation_started_7d"];
const META_TYPES: Array<[string, string[]]> = [
  ["Leads (formulário e site)", LEAD],
  ["Conversas iniciadas (WhatsApp/Direct)", MESSAGING],
  ["Compras", PURCHASE],
  ["Cadastros concluídos", ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"]],
  ["Contatos", ["contact_total", "contact", "offsite_conversion.fb_pixel_contact"]],
  ["Adições ao carrinho", ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"]],
];

/** Largest value among equivalent action types (Meta reports the same result under several names). */
const actionMax = (list: unknown, types: string[]) => {
  if (!Array.isArray(list)) return 0;
  let best = 0;
  for (const t of types) {
    const a = list.find((x: { action_type?: string }) => x.action_type === t) as { value?: string } | undefined;
    if (a) best = Math.max(best, Number(a.value ?? 0));
  }
  return best;
};
/** Meta conversions = leads + conversations started + purchases. */
const metaConversions = (actions: unknown) => actionMax(actions, LEAD) + actionMax(actions, MESSAGING) + actionMax(actions, PURCHASE);

type Range = { since: string; until: string };

function metaUrl(accountId: string, params: Record<string, string>, range: Range, filter: string | null) {
  const u = new URL(`${GRAPH}${accountId}/insights`);
  // Only since/until: Meta rejects any other key (e.g. the comparison dates) in time_range.
  u.searchParams.set("time_range", JSON.stringify({ since: range.since, until: range.until }));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (filter) u.searchParams.set("filtering", JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: filter }]));
  return u.toString();
}

async function metaCampaigns(token: string, accountId: string, range: Range, filter: string | null): Promise<CampaignRow[]> {
  const rows = await graphPages(metaUrl(accountId, { level: "campaign", fields: "campaign_name,spend,impressions,clicks,reach,actions,action_values", limit: "200" }, range, filter), token, 10);
  return rows.map((r) => ({
    platform: "meta" as const,
    account: accountId,
    name: String(r["campaign_name"] ?? "Campanha"),
    spend: Number(r["spend"] ?? 0),
    impressions: Number(r["impressions"] ?? 0),
    clicks: Number(r["clicks"] ?? 0),
    reach: Number(r["reach"] ?? 0),
    leads: actionMax(r["actions"], LEAD),
    conversions: metaConversions(r["actions"]),
    revenue: actionMax(r["action_values"], PURCHASE),
  }));
}

type Extras = {
  /** Non-blocking problems worth showing to the agency (never to the client). */
  warnings?: string[];
  daily: DailyPoint[];
  conversionTypes: ConversionType[];
  landingPageViews: number | null;
  creatives: Creative[];
  searchTerms: SearchTerm[];
  audience: Audience;
  history: MonthPoint[];
};
const emptyExtras = (): Extras => ({ daily: [], conversionTypes: [], landingPageViews: null, creatives: [], searchTerms: [], audience: { ageGender: [], region: [], device: [], placement: [] }, history: [] });

/** Optional sections never break the report: a failed call simply leaves that section empty. */
async function optional<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[report] ${label}:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

const GENDER: Record<string, string> = { male: "Homens", female: "Mulheres", unknown: "Não informado" };
const PLACEMENT: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads" };
const META_DEVICE: Record<string, string> = { mobile_app: "Celular", mobile_web: "Celular", desktop: "Computador" };

function audienceRows(rows: Row[], label: (r: Row) => string): AudienceRow[] {
  return rows.map((r) => ({ label: label(r), spend: Number(r["spend"] ?? 0), impressions: Number(r["impressions"] ?? 0), clicks: Number(r["clicks"] ?? 0), conversions: metaConversions(r["actions"]) }));
}

type MetaCreative = {
  image_url?: string;
  thumbnail_url?: string;
  image_hash?: string;
  object_story_spec?: { link_data?: { picture?: string; image_hash?: string; child_attachments?: Array<{ picture?: string; image_hash?: string }> }; video_data?: { image_url?: string; image_hash?: string }; photo_data?: { url?: string; image_hash?: string } };
  asset_feed_spec?: { images?: Array<{ url?: string; hash?: string }>; videos?: Array<{ thumbnail_url?: string }> };
};

/**
 * Best available picture for each ad: the creative image, the post/video/carousel picture, a
 * dynamic-creative asset, the image library (by hash) and finally the large thumbnail.
 */
async function metaAdImages(token: string, accountId: string, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const inner = "{image_url,thumbnail_url,image_hash,object_story_spec,asset_feed_spec}";
  const ask = async (creativeField: string) => {
    const res = await fetch(`${GRAPH}?ids=${ids.join(",")}&fields=${encodeURIComponent(creativeField + inner)}`, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, { creative?: MetaCreative }> & { error?: { message?: string } };
    return { ok: res.ok, json };
  };
  // Larger thumbnails first; plain request if the API refuses the size modifiers.
  let r = await ask("creative.thumbnail_width(600).thumbnail_height(600)");
  if (!r.ok) r = await ask("creative");
  const body = r.json;
  if (!r.ok) throw new Error("miniaturas: " + (body.error?.message ?? "falha"));
  const out: Record<string, string> = {};
  const needHash: Record<string, string> = {};
  for (const id of ids) {
    const c = (body[id] as { creative?: MetaCreative } | undefined)?.creative;
    if (!c) continue;
    const s = c.object_story_spec;
    const url =
      c.image_url ||
      s?.link_data?.picture ||
      s?.link_data?.child_attachments?.find((x) => x.picture)?.picture ||
      s?.video_data?.image_url ||
      s?.photo_data?.url ||
      c.asset_feed_spec?.images?.find((x) => x.url)?.url ||
      c.asset_feed_spec?.videos?.find((x) => x.thumbnail_url)?.thumbnail_url;
    const hash = c.image_hash || s?.link_data?.image_hash || s?.link_data?.child_attachments?.find((x) => x.image_hash)?.image_hash || s?.video_data?.image_hash || s?.photo_data?.image_hash || c.asset_feed_spec?.images?.find((x) => x.hash)?.hash;
    if (url) out[id] = url;
    else if (hash) needHash[id] = hash;
    if (!out[id] && c.thumbnail_url) out[id] = c.thumbnail_url;
  }
  const hashes = [...new Set(Object.values(needHash))];
  if (hashes.length) {
    const lib = await fetch(`${GRAPH}${accountId}/adimages?hashes=${encodeURIComponent(JSON.stringify(hashes))}&fields=hash,url,permalink_url`, { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: Array<{ hash?: string; url?: string; permalink_url?: string }> }>) : { data: [] }))
      .catch(() => ({ data: [] as Array<{ hash?: string; url?: string; permalink_url?: string }> }));
    const byHash = new Map((lib.data ?? []).map((i) => [i.hash ?? "", i.url || i.permalink_url || ""]));
    for (const [id, h] of Object.entries(needHash)) if (byHash.get(h)) out[id] = byHash.get(h)!;
  }
  return out;
}

async function metaExtras(token: string, accountId: string, range: Range, history: Range, filter: string | null, sections: Set<SectionKey>): Promise<Extras> {
  const base = "spend,impressions,clicks,actions";
  const [dailyRows, ads, ageGender, region, device, placement, months] = await Promise.all([
    optional("meta daily", () => graphPages(metaUrl(accountId, { level: "account", fields: base, time_increment: "1", limit: "100" }, range, filter), token, 5), [] as Row[]),
    sections.has("creatives")
      ? optional("meta ads", () => graphPages(metaUrl(accountId, { level: "ad", fields: "ad_id,ad_name," + base, sort: "spend_descending", limit: "8" }, range, filter), token, 1), [] as Row[])
      : Promise.resolve([] as Row[]),
    sections.has("audience") ? optional("meta age", () => graphPages(metaUrl(accountId, { fields: base, breakdowns: "age,gender", limit: "100" }, range, filter), token, 2), [] as Row[]) : Promise.resolve([] as Row[]),
    sections.has("audience") ? optional("meta region", () => graphPages(metaUrl(accountId, { fields: base, breakdowns: "region", limit: "100" }, range, filter), token, 2), [] as Row[]) : Promise.resolve([] as Row[]),
    sections.has("audience") ? optional("meta device", () => graphPages(metaUrl(accountId, { fields: base, breakdowns: "device_platform", limit: "50" }, range, filter), token, 1), [] as Row[]) : Promise.resolve([] as Row[]),
    sections.has("audience") ? optional("meta placement", () => graphPages(metaUrl(accountId, { fields: base, breakdowns: "publisher_platform", limit: "50" }, range, filter), token, 1), [] as Row[]) : Promise.resolve([] as Row[]),
    sections.has("history") || sections.has("goals")
      ? optional("meta history", () => graphPages(metaUrl(accountId, { level: "account", fields: base + ",action_values", time_increment: "monthly", limit: "12" }, history, filter), token, 2), [] as Row[])
      : Promise.resolve([] as Row[]),
  ]);

  const out = emptyExtras();
  out.daily = dailyRows.map((r) => ({ date: String(r["date_start"] ?? ""), spend: Number(r["spend"] ?? 0), impressions: Number(r["impressions"] ?? 0), clicks: Number(r["clicks"] ?? 0), conversions: metaConversions(r["actions"]) }));
  out.landingPageViews = dailyRows.reduce((s, r) => s + actionMax(r["actions"], ["landing_page_view", "omni_landing_page_view"]), 0);
  out.conversionTypes = META_TYPES.map(([label, types]) => ({ platform: "meta" as const, label, value: dailyRows.reduce((s, r) => s + actionMax(r["actions"], types), 0) })).filter((t) => t.value > 0);

  if (ads.length) {
    const ids = ads.map((a) => String(a["ad_id"] ?? "")).filter((id) => /^\d+$/.test(id));
    let thumbs: Record<string, string> = {};
    try {
      thumbs = await metaAdImages(token, accountId, ids);
      const missing = ids.filter((id) => !thumbs[id]).length;
      if (missing) out.warnings = [`Meta não devolveu imagem para ${missing} de ${ids.length} anúncios.`];
    } catch (e) {
      out.warnings = ["Imagens dos anúncios: " + (e instanceof Error ? e.message : "falha na Meta")];
    }
    out.creatives = ads.map((a) => {
      const id = String(a["ad_id"] ?? "");
      return { id, name: String(a["ad_name"] ?? "Anúncio"), thumbnail: thumbs[id] ?? null, spend: Number(a["spend"] ?? 0), impressions: Number(a["impressions"] ?? 0), clicks: Number(a["clicks"] ?? 0), conversions: metaConversions(a["actions"]) };
    });
  }
  out.audience = {
    ageGender: audienceRows(ageGender, (r) => `${String(r["age"] ?? "?")} · ${GENDER[String(r["gender"] ?? "unknown")] ?? "Outros"}`),
    region: audienceRows(region, (r) => String(r["region"] ?? "Não informado")),
    device: audienceRows(device, (r) => META_DEVICE[String(r["device_platform"] ?? "")] ?? "Outros"),
    placement: audienceRows(placement, (r) => PLACEMENT[String(r["publisher_platform"] ?? "")] ?? String(r["publisher_platform"] ?? "Outros")),
  };
  out.history = months.map((r) => ({
    month: String(r["date_start"] ?? "").slice(0, 7),
    spend: Number(r["spend"] ?? 0),
    impressions: Number(r["impressions"] ?? 0),
    clicks: Number(r["clicks"] ?? 0),
    conversions: metaConversions(r["actions"]),
    revenue: actionMax(r["action_values"], PURCHASE),
  }));
  return out;
}

/* ───────────────────────────── Google ───────────────────────────── */

type GRow = { segments?: Record<string, string>; campaign?: { name?: string }; metrics?: Record<string, string | number>; searchTermView?: { searchTerm?: string } };

async function gaql(token: string, customerId: string, query: string): Promise<GRow[]> {
  const res = await fetch(`https://googleads.googleapis.com/${googleAdsVersion()}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: googleHeaders(token),
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Google Ads (" + res.status + "): " + (await res.text()).slice(0, 200));
  const batches = (await res.json()) as Array<{ results?: GRow[] }>;
  return batches.flatMap((b) => b.results ?? []);
}
const gNum = (r: GRow, k: string) => Number(r.metrics?.[k] ?? 0);
const gSpend = (r: GRow) => gNum(r, "costMicros") / 1e6;

export async function syncGoogleCatalog(token: string) {
  const rows = (await gaql(
    token,
    MCC_CUSTOMER_ID,
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status, customer_client.manager FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status != 'CANCELED' AND customer_client.status != 'CLOSED'",
  )) as unknown as Array<{ customerClient?: { id?: string | number; descriptiveName?: string; currencyCode?: string; status?: string } }>;
  const all = new Map<string, { account_id: string; name: string; currency: string; status: string }>();
  for (const r of rows) {
    const c = r.customerClient;
    const id = String(c?.id ?? "");
    if (/^\d{10}$/.test(id) && id !== MCC_CUSTOMER_ID) all.set(id, { account_id: id, name: c?.descriptiveName || "Conta " + id, currency: c?.currencyCode ?? "", status: c?.status ?? "" });
  }
  return [...all.values()];
}

/** GAQL condition for the optional campaign-name filter (quotes and backslashes removed). */
const gFilter = (filter: string | null) => (filter ? ` AND campaign.name LIKE '%${filter.replace(/['\\]/g, "")}%'` : "");
const between = (r: Range) => `segments.date BETWEEN '${r.since}' AND '${r.until}'`;

async function googleCampaigns(token: string, customerId: string, range: Range, filter: string | null): Promise<CampaignRow[]> {
  const rows = await gaql(token, customerId, `SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${between(range)}${gFilter(filter)}`);
  return rows.map((r) => ({
    platform: "google" as const,
    account: customerId,
    name: r.campaign?.name ?? "Campanha",
    spend: gSpend(r),
    impressions: gNum(r, "impressions"),
    clicks: gNum(r, "clicks"),
    conversions: gNum(r, "conversions"),
    revenue: gNum(r, "conversionsValue"),
    leads: null,
    reach: null,
  }));
}

const G_DEVICE: Record<string, string> = { MOBILE: "Celular", DESKTOP: "Computador", TABLET: "Tablet", CONNECTED_TV: "TV conectada" };

async function googleExtras(token: string, id: string, range: Range, history: Range, filter: string | null, sections: Set<SectionKey>): Promise<Extras> {
  const f = gFilter(filter);
  const w = between(range);
  const [daily, types, device, terms, months] = await Promise.all([
    optional("google daily", () => gaql(token, id, `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE ${w}${f}`), [] as GRow[]),
    sections.has("conversions")
      ? optional("google conv types", () => gaql(token, id, `SELECT segments.conversion_action_name, metrics.conversions FROM campaign WHERE ${w}${f} AND metrics.conversions > 0`), [] as GRow[])
      : Promise.resolve([] as GRow[]),
    sections.has("audience")
      ? optional("google device", () => gaql(token, id, `SELECT segments.device, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE ${w}${f}`), [] as GRow[])
      : Promise.resolve([] as GRow[]),
    sections.has("search_terms")
      ? optional("google search terms", () => gaql(token, id, `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM search_term_view WHERE ${w}${f} ORDER BY metrics.clicks DESC LIMIT 25`), [] as GRow[])
      : Promise.resolve([] as GRow[]),
    sections.has("history") || sections.has("goals")
      ? optional("google history", () => gaql(token, id, `SELECT segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${between(history)}${f}`), [] as GRow[])
      : Promise.resolve([] as GRow[]),
  ]);
  const out = emptyExtras();
  const byDate = new Map<string, DailyPoint>();
  for (const r of daily) {
    const date = r.segments?.["date"] ?? "";
    const d = byDate.get(date) ?? { date, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    d.spend += gSpend(r);
    d.impressions += gNum(r, "impressions");
    d.clicks += gNum(r, "clicks");
    d.conversions += gNum(r, "conversions");
    byDate.set(date, d);
  }
  out.daily = [...byDate.values()];
  const byType = new Map<string, number>();
  for (const r of types) {
    const label = r.segments?.["conversionActionName"] ?? "Conversão";
    byType.set(label, (byType.get(label) ?? 0) + gNum(r, "conversions"));
  }
  out.conversionTypes = [...byType].map(([label, value]) => ({ platform: "google" as const, label, value }));
  out.audience.device = device.map((r) => ({ label: G_DEVICE[r.segments?.["device"] ?? ""] ?? "Outros", spend: gSpend(r), impressions: gNum(r, "impressions"), clicks: gNum(r, "clicks"), conversions: gNum(r, "conversions") }));
  out.searchTerms = terms.map((r) => ({ term: r.searchTermView?.searchTerm ?? "", impressions: gNum(r, "impressions"), clicks: gNum(r, "clicks"), conversions: gNum(r, "conversions"), spend: gSpend(r) }));
  out.history = months.map((r) => ({ month: (r.segments?.["month"] ?? "").slice(0, 7), spend: gSpend(r), impressions: gNum(r, "impressions"), clicks: gNum(r, "clicks"), conversions: gNum(r, "conversions"), revenue: gNum(r, "conversionsValue") }));
  return out;
}

/* ───────────────────────────── Merge helpers ───────────────────────────── */

function sum(rows: Totals[]): Totals {
  const t = empty();
  for (const r of rows) {
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.conversions += r.conversions;
    t.revenue += r.revenue;
    if (r.leads !== null) t.leads = (t.leads ?? 0) + r.leads;
    if (r.reach !== null) t.reach = (t.reach ?? 0) + r.reach;
  }
  return t;
}

function mergeBy<T extends { spend: number; impressions: number; clicks: number; conversions: number }>(rows: T[], key: (r: T) => string, make: (k: string) => T): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    const acc = m.get(k) ?? make(k);
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.conversions += r.conversions;
    m.set(k, acc);
  }
  return [...m.values()];
}

/** Every day of the period, so gaps show up as zero instead of disappearing from the chart. */
function fillDays(points: DailyPoint[], range: Range): DailyPoint[] {
  const merged = new Map(mergeBy(points, (p) => p.date, (date) => ({ date, spend: 0, impressions: 0, clicks: 0, conversions: 0 })).map((p) => [p.date, p]));
  const out: DailyPoint[] = [];
  for (let t = Date.parse(range.since + "T00:00:00Z"); t <= Date.parse(range.until + "T00:00:00Z"); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(merged.get(date) ?? { date, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  }
  return out;
}

function localToday(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}
/** Six full calendar months ending with the current one, through yesterday. */
function historyRange(today: string): Range {
  const [y, m] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 6, 1));
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86_400_000);
  return { since: start.toISOString().slice(0, 10), until: yesterday.toISOString().slice(0, 10) };
}
function sixMonths(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y ?? 2000, (m ?? 1) - 6 + i, 1)).toISOString().slice(0, 7));
}

/* ───────────────────────────── Report ───────────────────────────── */

function customRange(r: { since: string; until: string }) {
  const day = 86_400_000;
  const a = Date.parse(r.since + "T00:00:00Z"), b = Date.parse(r.until + "T00:00:00Z");
  const len = Math.round((b - a) / day) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { since: r.since, until: r.until, prevSince: iso(a - len * day), prevUntil: iso(a - day) };
}

type ClientInput = {
  name: string;
  timezone: string;
  logo_url: string | null;
  monthly_budget: number | null;
  goal_cpa: number | null;
  goal_conversions_month: number | null;
  goal_roas: number | null;
  meta_tax_pct: number | null;
  google_tax_pct: number | null;
};
type ConfigInput = {
  name: string;
  platforms: string[];
  metrics: string[];
  period: string;
  compare_previous: boolean;
  campaign_filter: string | null;
  intro_message: string | null;
  objective: string | null;
  sections: string[] | null;
  manager_notes: string | null;
  actions_taken: string | null;
  next_steps: string | null;
  /** Explicit dates (agency overview). The comparison window is the same length right before it. */
  range?: { since: string; until: string } | undefined;
};
export type ReportConfigInput = { client: ClientInput; config: ConfigInput; accounts: Array<{ provider: string; account_id: string; account_name: string }> };

export async function buildReport(input: ReportConfigInput): Promise<FullReport> {
  const tz = input.client.timezone || "America/Sao_Paulo";
  const range = input.config.range ? customRange(input.config.range) : resolvePeriod(input.config.period as ReportPeriod, tz);
  const today = localToday(tz);
  const hist = historyRange(today);
  const objective = isObjective(input.config.objective ?? "") ? (input.config.objective as FullReport["objective"]) : "leads";
  const sections = (input.config.sections?.length ? input.config.sections : ALL_SECTIONS).filter((s): s is SectionKey => (ALL_SECTIONS as string[]).includes(s));
  const sectionSet = new Set(sections);
  const filter = input.config.campaign_filter?.trim() || null;
  const tokens = await agencyTokens();
  const errors: string[] = [];
  const platforms = (["meta", "google"] as const).filter((p) => input.config.platforms.includes(p) && input.accounts.some((a) => a.provider === p));
  const current: CampaignRow[] = [];
  const previous: CampaignRow[] = [];
  const extras: Array<Extras & { platform: Platform }> = [];

  await Promise.all(
    input.accounts
      .filter((a) => platforms.includes(a.provider as Platform))
      .map(async (a) => {
        const platform = a.provider as Platform;
        const token = platform === "meta" ? tokens.meta : tokens.google;
        if (!token) {
          errors.push(`${platform === "meta" ? "Meta" : "Google"} Ads não conectado.`);
          return;
        }
        const camp = platform === "meta" ? metaCampaigns : googleCampaigns;
        const extra = platform === "meta" ? metaExtras : googleExtras;
        try {
          const [cur, prev, ex] = await Promise.all([
            camp(token, a.account_id, range, filter),
            input.config.compare_previous ? camp(token, a.account_id, { since: range.prevSince, until: range.prevUntil }, filter) : Promise.resolve([] as CampaignRow[]),
            extra(token, a.account_id, range, hist, filter, sectionSet),
          ]);
          current.push(...cur);
          previous.push(...prev);
          extras.push({ ...ex, platform });
          if (input.config.range && ex.warnings?.length) errors.push(...ex.warnings.map((w) => `${a.account_name}: ${w}`));
        } catch (e) {
          errors.push(`${a.account_name}: ${e instanceof Error ? e.message : "falha na consulta"}`);
        }
      }),
  );

  const byPlatform: FullReport["byPlatform"] = {};
  for (const p of platforms) byPlatform[p] = { current: sum(current.filter((c) => c.platform === p)), previous: input.config.compare_previous ? sum(previous.filter((c) => c.platform === p)) : null };
  const total = { current: sum(current), previous: input.config.compare_previous ? sum(previous) : null };

  const metaLpv = extras.filter((e) => e.platform === "meta" && e.landingPageViews !== null);
  const funnel = {
    impressions: total.current.impressions,
    clicks: total.current.clicks,
    landingPageViews: metaLpv.length ? metaLpv.reduce((s, e) => s + (e.landingPageViews ?? 0), 0) : null,
    conversions: total.current.conversions,
  };

  const conversionTypes = mergeBy(
    extras.flatMap((e) => e.conversionTypes.map((t) => ({ ...t, spend: 0, impressions: 0, clicks: 0, conversions: t.value }))),
    (t) => t.platform + "|" + t.label,
    (k) => ({ platform: k.split("|")[0] as Platform, label: k.split("|").slice(1).join("|"), value: 0, spend: 0, impressions: 0, clicks: 0, conversions: 0 }),
  )
    .map((t) => ({ platform: t.platform, label: t.label, value: t.conversions }))
    .sort((a, b) => b.value - a.value);

  const audienceOf = (k: keyof Audience, limit: number) =>
    mergeBy(
      extras.flatMap((e) => e.audience[k]),
      (r) => r.label,
      (label) => ({ label, spend: 0, impressions: 0, clicks: 0, conversions: 0 }),
    )
      .sort((a, b) => b.spend - a.spend)
      .slice(0, limit);

  const historyMap = new Map<string, MonthPoint>(sixMonths(today).map((month) => [month, { month, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }]));
  for (const h of extras.flatMap((e) => e.history)) {
    const m = historyMap.get(h.month);
    if (!m) continue;
    m.spend += h.spend;
    m.impressions += h.impressions;
    m.clicks += h.clicks;
    m.conversions += h.conversions;
    m.revenue += h.revenue;
  }
  const history = [...historyMap.values()];
  const hasHistory = extras.some((e) => e.history.length > 0);

  const goals = evaluateGoals(input.client, total.current, range);
  const pacing = hasHistory ? evaluatePacing(input.client.monthly_budget, historyMap.get(today.slice(0, 7))?.spend ?? 0, today) : null;
  const taxes = { meta: Number(input.client.meta_tax_pct ?? 0), google: Number(input.client.google_tax_pct ?? 0) };
  // Keep the top campaigns of each platform so neither one is crowded out of the report.
  const campaigns = platforms.flatMap((p) => current.filter((c) => c.platform === p).sort((a, b) => b.spend - a.spend).slice(0, 40));
  const highlights = buildHighlights({ objective, total, byPlatform, campaigns, goals, pacing });

  return {
    clientName: input.client.name,
    logoUrl: input.client.logo_url,
    reportName: input.config.name,
    intro: input.config.intro_message,
    objective,
    sections,
    metrics: input.config.metrics,
    period: input.config.period,
    range,
    compare: input.config.compare_previous,
    total,
    byPlatform,
    campaigns,
    daily: fillDays(extras.flatMap((e) => e.daily), range),
    conversionTypes,
    funnel,
    creatives: extras
      .flatMap((e) => e.creatives)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6),
    searchTerms: mergeBy(
      extras.flatMap((e) => e.searchTerms),
      (t) => t.term.toLowerCase(),
      (term) => ({ term, impressions: 0, clicks: 0, conversions: 0, spend: 0 }),
    )
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 15),
    audience: { ageGender: audienceOf("ageGender", 12), region: audienceOf("region", 10), device: audienceOf("device", 5), placement: audienceOf("placement", 6) },
    history: hasHistory ? history : [],
    goals,
    pacing,
    taxes: { ...taxes, spendWithTax: spendWithTaxes(byPlatform, taxes) },
    analysis: { notes: input.config.manager_notes, actions: input.config.actions_taken, nextSteps: input.config.next_steps },
    highlights,
    errors: [...new Set(errors)],
    generatedAt: new Date().toISOString(),
  };
}

export async function loadConfigForReport(by: { token?: string; id?: string }) {
  const db = await admin();
  let q = db
    .from("report_configs")
    .select("id,name,platforms,metrics,period,compare_previous,campaign_filter,intro_message,channels,active,client_id,share_token,objective,sections,manager_notes,actions_taken,next_steps");
  q = by.token ? q.eq("share_token", by.token) : q.eq("id", by.id ?? "");
  const { data: config } = await q.maybeSingle();
  if (!config) return null;
  const [{ data: client }, { data: accounts }] = await Promise.all([
    db.from("clients").select("name,timezone,logo_url,active,monthly_budget,goal_cpa,goal_conversions_month,goal_roas,meta_tax_pct,google_tax_pct").eq("id", config.client_id).maybeSingle(),
    db.from("client_ad_accounts").select("provider,account_id,account_name").eq("client_id", config.client_id),
  ]);
  if (!client) return null;
  return { config, client, accounts: accounts ?? [] };
}

/** Share tokens for report panels: "r" + 48 hex chars (distinct from the 64-hex Google live links). */
export const REPORT_TOKEN_RE = /^r[0-9a-f]{48}$/;
export async function newReportToken() {
  const { randomBytes } = await import("node:crypto");
  return "r" + randomBytes(24).toString("hex");
}

/**
 * Loads a configuration (by id or public token) and builds its report.
 * Unless `fresh` is set, a report built in the last 30 minutes is reused so public panels do not
 * spend the ad platforms' daily API quota on every visit. Sends and PDFs for admins use fresh data.
 */
export async function buildReportFor(by: { token?: string; id?: string }, opts: { fresh?: boolean } = {}) {
  const loaded = await loadConfigForReport(by);
  if (!loaded) return null;
  const db = await admin();
  if (!opts.fresh) {
    const { data: cached } = await db.from("report_cache").select("data,built_at").eq("report_config_id", loaded.config.id).maybeSingle();
    if (cached && Date.now() - Date.parse(cached.built_at) < CACHE_MAX_AGE_MS) {
      // Manager text is edited often: always take the current version.
      const report = { ...(cached.data as unknown as FullReport), analysis: { notes: loaded.config.manager_notes, actions: loaded.config.actions_taken, nextSteps: loaded.config.next_steps } };
      return { ...loaded, report };
    }
  }
  const report = await buildReport({ client: loaded.client, config: loaded.config, accounts: loaded.accounts });
  if (!(report.errors.length && report.total.current.spend === 0 && report.campaigns.length === 0)) {
    await db.from("report_cache").upsert({ report_config_id: loaded.config.id, data: report as never, built_at: report.generatedAt });
  }
  return { ...loaded, report };
}

export function appOrigin() {
  return (process.env["APP_ORIGIN"] ?? "").replace(/\/$/, "");
}
export function reportPanelUrl(token: string) {
  return `${appOrigin()}/live/${token}`;
}
export function reportPdfUrl(token: string) {
  return `${appOrigin()}/api/report-pdf?token=${token}`;
}
