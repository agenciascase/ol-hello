import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { googleAdsVersion, googleHeaders, MCC_CUSTOMER_ID, META_BUSINESS_ID } from "../../lib/ads-oauth.server";
import { agencyTokens } from "../../lib/report-data.server";
import { channelsPublic } from "../../lib/delivery-channels.server";

type Conn = { provider: string; owner_id: string; expires_at: string; updated_at: string; refresh_token_ciphertext: string | null };
export type ProviderStatus = {
  provider: "meta" | "google";
  connected: boolean;
  expiresAt: string | null;
  authorizedAt: string | null;
  accounts: number;
  lastSync: string | null;
  /** Who connected it on the platform (agency user e-mail). */
  connectedBy: string | null;
  /** The external profile that granted access: Facebook user name or Google account e-mail. */
  profile: string | null;
  profileHint: string | null;
  /** The agency asset reached through that profile: Business Manager or MCC. */
  asset: { id: string; name: string | null };
};

const withTimeout = <T,>(p: Promise<T>, ms = 6000) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function metaProfile(token: string) {
  const get = async (path: string) => {
    const r = await withTimeout(fetch(`https://graph.facebook.com/v24.0/${path}`, { headers: { Authorization: "Bearer " + token }, cache: "no-store" }));
    return r.ok ? ((await r.json()) as { id?: string; name?: string }) : null;
  };
  const [me, bm] = await Promise.all([get("me?fields=id,name").catch(() => null), get(`${META_BUSINESS_ID}?fields=id,name`).catch(() => null)]);
  return { profile: me?.name ?? null, profileHint: me?.id ? `ID ${me.id}` : null, assetName: bm?.name ?? null };
}

async function googleProfile(token: string) {
  const [info, mcc] = await Promise.all([
    withTimeout(fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, { cache: "no-store" }))
      .then(async (r) => (r.ok ? ((await r.json()) as { email?: string }) : null))
      .catch(() => null),
    withTimeout(
      fetch(`https://googleads.googleapis.com/${googleAdsVersion()}/customers/${MCC_CUSTOMER_ID}/googleAds:searchStream`, {
        method: "POST",
        headers: googleHeaders(token),
        body: JSON.stringify({ query: "SELECT customer.descriptive_name FROM customer LIMIT 1" }),
        cache: "no-store",
      }),
    )
      .then(async (r) => (r.ok ? ((await r.json()) as Array<{ results?: Array<{ customer?: { descriptiveName?: string } }> }>) : null))
      .catch(() => null),
  ]);
  return {
    profile: info?.email ?? null,
    profileHint: info?.email ? null : "Reconecte o Google Ads uma vez para exibir o e-mail da conta Google.",
    assetName: mcc?.[0]?.results?.[0]?.customer?.descriptiveName ?? null,
  };
}

// Admin-only: connection state, linked profiles, catalogue freshness and delivery channel readiness (never secret values).
export const Route = createFileRoute("/api/integrations/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        const db = await supabaseAdmin();
        // Tokens first: this refreshes Google and repairs a wrong Meta expiry before we read the records.
        const tokens = await agencyTokens().catch(() => ({}) as { meta?: string; google?: string });
        const [{ data: conns }, { data: catalog }] = await Promise.all([
          db.from("ads_connections").select("provider,owner_id,expires_at,updated_at,refresh_token_ciphertext").order("updated_at", { ascending: false }),
          db.from("ad_accounts_catalog").select("provider,synced_at"),
        ]);
        const rows = (conns ?? []) as unknown as Conn[];
        const providers: ProviderStatus[] = await Promise.all(
          (["meta", "google"] as const).map(async (provider) => {
            const c = rows.find((r) => r.provider === provider);
            const accounts = (catalog ?? []).filter((a) => a.provider === provider);
            const lastSync = accounts.reduce<string | null>((max, a) => (!max || a.synced_at > max ? a.synced_at : max), null);
            const token = provider === "meta" ? tokens.meta : tokens.google;
            // agencyTokens() refreshes Google and re-checks Meta with Meta itself, so a usable token means connected.
            const expired = !token;
            const [owner, ext] = await Promise.all([
              c ? db.auth.admin.getUserById(c.owner_id).then((r) => r.data.user?.email ?? null).catch(() => null) : Promise.resolve(null),
              token ? (provider === "meta" ? metaProfile(token) : googleProfile(token)) : Promise.resolve({ profile: null, profileHint: null, assetName: null }),
            ]);
            return {
              provider,
              connected: Boolean(c) && !expired,
              expiresAt: c?.expires_at ?? null,
              authorizedAt: c?.updated_at ?? null,
              accounts: accounts.length,
              lastSync,
              connectedBy: owner,
              profile: ext.profile,
              profileHint: ext.profileHint,
              asset: { id: provider === "meta" ? META_BUSINESS_ID : "226-294-0733", name: ext.assetName },
            };
          }),
        );
        return Response.json(
          { providers, channels: await channelsPublic() },
          { headers: noStore },
        );
      },
    },
  },
});
