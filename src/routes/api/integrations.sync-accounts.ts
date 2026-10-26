import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { agencyTokens, syncGoogleCatalog, syncMetaCatalog } from "../../lib/report-data.server";

// Admin-only: imports every ad account under the agency BM and every client account under the MCC.
export const Route = createFileRoute("/api/integrations/sync-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireAgencyAdmin(request, { mutating: true });
        if (denied) return denied;
        const db = await supabaseAdmin();
        let tokens: Awaited<ReturnType<typeof agencyTokens>>;
        try {
          tokens = await agencyTokens();
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Credenciais indisponíveis.") }, { status: 503, headers: noStore });
        }
        const syncedAt = new Date().toISOString();
        const result: Record<"meta" | "google", { count: number; error: string | null }> = {
          meta: { count: 0, error: null },
          google: { count: 0, error: null },
        };
        const jobs: Array<["meta" | "google", string | undefined, (t: string) => Promise<Array<{ account_id: string; name: string; currency: string; status: string }>>]> = [
          ["meta", tokens.meta, syncMetaCatalog],
          ["google", tokens.google, syncGoogleCatalog],
        ];
        await Promise.all(
          jobs.map(async ([provider, token, fn]) => {
            if (!token) {
              result[provider].error = provider === "meta" ? "Meta Ads não conectado ou autorização expirada." : "Google Ads não conectado.";
              return;
            }
            try {
              const accounts = await fn(token);
              if (accounts.length) {
                const { error } = await db
                  .from("ad_accounts_catalog")
                  .upsert(accounts.map((a) => ({ provider, ...a, synced_at: syncedAt })), { onConflict: "provider,account_id" });
                if (error) throw new Error("Falha ao salvar o catálogo: " + error.message);
              }
              result[provider].count = accounts.length;
            } catch (e) {
              result[provider].error = errorMessage(e, "Falha na sincronização.");
            }
          }),
        );
        return Response.json({ syncedAt, result }, { headers: noStore });
      },
    },
  },
});
