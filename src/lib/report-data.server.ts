/** Server-only: fetches real Meta/Google metrics for report configurations. Tokens never leave the server. */
import { decryptToken, encryptToken } from "./ads-credentials.server";
import { MCC_CUSTOMER_ID, META_BUSINESS_ID, refreshGoogleToken } from "./ads-oauth.server";
import { resolvePeriod, type ReportPeriod } from "./report-schedule";

const GRAPH = "https://graph.facebook.com/v24.0/";
export type Totals = { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; leads: number | null; reach: number | null };
export type CampaignRow = Totals & { name: string; platform: "meta" | "google"; account: string };
const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, leads: null, reach: null });

export function googleHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { authorization: "Bearer " + token, "login-customer-id": MCC_CUSTOMER_ID, "content-type": "application/json" };
  const dev = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];
  if (dev) h["developer-token"] = dev;
  return h;
}
const googleVersion = () => process.env["GOOGLE_ADS_API_VERSION"] || "v26";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Agency-level tokens (the most recently authorized admin connection per provider). */
export async function agencyTokens() {
  const db = await admin();
  const { data, error } = await db.from("ads_connections" as never).select("provider,owner_id,access_token_ciphertext,refresh_token_ciphertext,expires_at,updated_at").order("updated_at", { ascending: false });
  if (error) throw new Error("Credenciais indisponíveis");
  const rows = (data ?? []) as unknown as Array<{ provider: string; owner_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string | null; expires_at: string }>;
  const out: { meta?: string; google?: string } = {};
  const meta = rows.find((r) => r.provider === "meta");
  if (meta && Date.parse(meta.expires_at) > Date.now() + 60000) out.meta = decryptToken(meta.access_token_ciphertext);
  const g = rows.find((r) => r.provider === "google");
  if (g) {
    if (Date.parse(g.expires_at) > Date.now() + 60000) out.google = decryptToken(g.access_token_ciphertext);
    else if (g.refresh_token_ciphertext) {
      const fresh = await refreshGoogleToken(decryptToken(g.refresh_token_ciphertext));
      out.google = fresh.access_token;
      await db.from("ads_connections" as never).update({ access_token_ciphertext: encryptToken(fresh.access_token), expires_at: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString() } as never).eq("provider", "google").eq("owner_id", g.owner_id);
    }
  }
  return out;
}

async function graphPages(url: string, token: string, max = 30) {
  const rows: Array<Record<string, unknown>> = [];
  let next = url;
  for (let i = 0; i < max && next; i++) {
    const res = await fetch(next, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const body = (await res.json()) as { data?: Array<Record<string, unknown>>; paging?: { next?: string }; error?: { message?: string } };
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
      const id = String(r.id ?? "");
      if (!/^act_\d+$/.test(id)) continue;
      const st = Number(r.account_status ?? 0);
      all.set(id, { account_id: id, name: String(r.name ?? id), currency: String(r.currency ?? ""), status: st === 1 ? "ACTIVE" : st === 2 ? "DISABLED" : st === 101 ? "CLOSED" : "STATUS_" + st });
    }
  }
  return [...all.values()];
}

export async function syncGoogleCatalog(token: string) {
  const query = "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status, customer_client.manager FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status != 'CANCELED' AND customer_client.status != 'CLOSED'";
  const res = await fetch(`https://googleads.googleapis.com/${googleVersion()}/customers/${MCC_CUSTOMER_ID}/googleAds:searchStream`, { method: "POST", headers: googleHeaders(token), body: JSON.stringify({ query }), cache: "no-store" });
  if (!res.ok) throw new Error("Google Ads recusou a listagem da MCC (" + res.status + "): " + (await res.text()).slice(0, 300));
  const batches = (await res.json()) as Array<{ results?: Array<{ customerClient?: { id?: string | number; descriptiveName?: string; currencyCode?: string; status?: string } }> }>;
  const all = new Map<string, { account_id: string; name: string; currency: string; status: string }>();
  for (const r of batches.flatMap((b) => b.results ?? [])) {
    const c = r.customerClient; const id = String(c?.id ?? "");
    if (/^\d{10}$/.test(id) && id !== MCC_CUSTOMER_ID) all.set(id, { account_id: id, name: c?.descriptiveName || "Conta " + id, currency: c?.currencyCode ?? "", status: c?.status ?? "" });
  }
  return [...all.values()];
}

const matches = (name: string, filter: string | null) => !filter || name.toLowerCase().includes(filter.toLowerCase());
const actionSum = (list: unknown, types: string[]) => {
  if (!Array.isArray(list)) return 0;
  let best = 0;
  for (const t of types) { const a = list.find((x: { action_type?: string }) => x.action_type === t) as { value?: string } | undefined; if (a) best = Math.max(best, Number(a.value ?? 0)); }
  return best;
};

async function metaCampaigns(token: string, accountId: string, since: string, until: string, filter: string | null): Promise<CampaignRow[]> {
  const u = new URL(`${GRAPH}${accountId}/insights`);
  u.searchParams.set("level", "campaign");
  u.searchParams.set("fields", "campaign_name,spend,impressions,clicks,reach,actions,action_values");
  u.searchParams.set("time_range", JSON.stringify({ since, until }));
  u.searchParams.set("limit", "200");
  const rows = await graphPages(u.toString(), token, 10);
  return rows.map((r) => {
    const leads = actionSum(r.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
    const purchases = actionSum(r.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
    return { platform: "meta" as const, account: accountId, name: String(r.campaign_name ?? "Campanha"), spend: Number(r.spend ?? 0), impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), reach: Number(r.reach ?? 0), leads, conversions: purchases + leads, revenue: actionSum(r.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]) };
  }).filter((c) => matches(c.name, filter));
}

async function googleCampaigns(token: string, customerId: string, since: string, until: string, filter: string | null): Promise<CampaignRow[]> {
  const query = `SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const res = await fetch(`https://googleads.googleapis.com/${googleVersion()}/customers/${customerId}/googleAds:searchStream`, { method: "POST", headers: googleHeaders(token), body: JSON.stringify({ query }), cache: "no-store" });
  if (!res.ok) throw new Error("Google Ads (" + res.status + ")");
  const batches = (await res.json()) as Array<{ results?: Array<{ campaign?: { name?: string }; metrics?: Record<string, string | number> }> }>;
  return batches.flatMap((b) => b.results ?? []).map((r) => ({
    platform: "google" as const, account: customerId, name: r.campaign?.name ?? "Campanha", spend: Number(r.metrics?.costMicros ?? 0) / 1e6, impressions: Number(r.metrics?.impressions ?? 0), clicks: Number(r.metrics?.clicks ?? 0), conversions: Number(r.metrics?.conversions ?? 0), revenue: Number(r.metrics?.conversionsValue ?? 0), leads: null, reach: null,
  })).filter((c) => matches(c.name, filter));
}

function sum(rows: Totals[]): Totals {
  const t = empty();
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks; t.conversions += r.conversions; t.revenue += r.revenue;
    if (r.leads !== null) t.leads = (t.leads ?? 0) + r.leads;
    if (r.reach !== null) t.reach = (t.reach ?? 0) + r.reach;
  }
  return t;
}

export type ReportConfigInput = { client: { name: string; timezone: string; logo_url: string | null }; config: { name: string; platforms: string[]; metrics: string[]; period: string; compare_previous: boolean; campaign_filter: string | null; intro_message: string | null }; accounts: Array<{ provider: string; account_id: string; account_name: string }> };

export async function buildReport(input: ReportConfigInput) {
  const range = resolvePeriod(input.config.period as ReportPeriod, input.client.timezone || "America/Sao_Paulo");
  const tokens = await agencyTokens();
  const errors: string[] = [];
  const platforms = (["meta", "google"] as const).filter((p) => input.config.platforms.includes(p));
  const current: CampaignRow[] = []; const previous: CampaignRow[] = [];
  await Promise.all(input.accounts.filter((a) => platforms.includes(a.provider as "meta" | "google")).map(async (a) => {
    const token = a.provider === "meta" ? tokens.meta : tokens.google;
    if (!token) { errors.push(`${a.provider === "meta" ? "Meta" : "Google"} Ads não conectado.`); return; }
    const fn = a.provider === "meta" ? metaCampaigns : googleCampaigns;
    try {
      const [cur, prev] = await Promise.all([fn(token, a.account_id, range.since, range.until, input.config.campaign_filter), input.config.compare_previous ? fn(token, a.account_id, range.prevSince, range.prevUntil, input.config.campaign_filter) : Promise.resolve([])]);
      current.push(...cur); previous.push(...prev);
    } catch (e) { errors.push(`${a.account_name}: ${e instanceof Error ? e.message : "falha na consulta"}`); }
  }));
  const byPlatform = Object.fromEntries(platforms.map((p) => [p, { current: sum(current.filter((c) => c.platform === p)), previous: input.config.compare_previous ? sum(previous.filter((c) => c.platform === p)) : null }]));
  return {
    clientName: input.client.name, logoUrl: input.client.logo_url, reportName: input.config.name, intro: input.config.intro_message,
    metrics: input.config.metrics, period: input.config.period, range, compare: input.config.compare_previous,
    total: { current: sum(current), previous: input.config.compare_previous ? sum(previous) : null },
    byPlatform, campaigns: current.sort((a, b) => b.spend - a.spend).slice(0, 50), errors: [...new Set(errors)], generatedAt: new Date().toISOString(),
  };
}
export type BuiltReport = Awaited<ReturnType<typeof buildReport>>;

export async function loadConfigForReport(by: { token?: string; id?: string }) {
  const db = await admin();
  let q = db.from("report_configs").select("id,name,platforms,metrics,period,compare_previous,campaign_filter,intro_message,active,client_id,share_token");
  q = by.token ? q.eq("share_token", by.token) : q.eq("id", by.id!);
  const { data: config } = await q.maybeSingle();
  if (!config) return null;
  const [{ data: client }, { data: accounts }] = await Promise.all([
    db.from("clients").select("name,timezone,logo_url,active").eq("id", config.client_id).maybeSingle(),
    db.from("client_ad_accounts").select("provider,account_id,account_name").eq("client_id", config.client_id),
  ]);
  if (!client) return null;
  return { config, client, accounts: accounts ?? [] };
}
