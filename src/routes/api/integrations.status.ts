import { createFileRoute } from "@tanstack/react-router";
import { noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";

type Conn = { provider: string; expires_at: string; updated_at: string; refresh_token_ciphertext: string | null };

// Admin-only: connection state, catalogue freshness and which delivery secrets are configured (never their values).
export const Route = createFileRoute("/api/integrations/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        const db = await supabaseAdmin();
        const [{ data: conns }, { data: catalog }] = await Promise.all([
          db.from("ads_connections").select("provider,expires_at,updated_at,refresh_token_ciphertext").order("updated_at", { ascending: false }),
          db.from("ad_accounts_catalog").select("provider,synced_at"),
        ]);
        const providers = (["meta", "google"] as const).map((provider) => {
          const c = ((conns ?? []) as unknown as Conn[]).find((r) => r.provider === provider);
          const accounts = (catalog ?? []).filter((a) => a.provider === provider);
          const lastSync = accounts.reduce<string | null>((max, a) => (!max || a.synced_at > max ? a.synced_at : max), null);
          const expired = c ? Date.parse(c.expires_at) <= Date.now() && !(provider === "google" && c.refresh_token_ciphertext) : true;
          return { provider, connected: Boolean(c) && !expired, expiresAt: c?.expires_at ?? null, authorizedAt: c?.updated_at ?? null, accounts: accounts.length, lastSync };
        });
        const has = (k: string) => Boolean(process.env[k]);
        const waProvider = process.env["WHATSAPP_PROVIDER"] || "meta";
        return Response.json(
          {
            providers,
            config: {
              googleDeveloperToken: has("GOOGLE_ADS_DEVELOPER_TOKEN"),
              appOrigin: has("APP_ORIGIN"),
              email: has("RESEND_API_KEY") && has("REPORT_EMAIL_FROM"),
              whatsapp: waProvider === "zapi" ? has("ZAPI_INSTANCE_ID") && has("ZAPI_TOKEN") : has("WHATSAPP_TOKEN") && has("WHATSAPP_PHONE_NUMBER_ID") && has("WHATSAPP_TEMPLATE_NAME"),
              whatsappProvider: waProvider,
              cron: has("LOVABLE_CRON_SECRET"),
            },
          },
          { headers: noStore },
        );
      },
    },
  },
});
