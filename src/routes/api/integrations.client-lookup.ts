import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { agencyTokens } from "../../lib/report-data.server";

type Found = { provider: "meta" | "google"; account_id: string; name: string; currency: string | null; linkedTo: { id: string; name: string } | null };
const GRAPH = "https://graph.facebook.com/v24.0/";

async function graph<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(GRAPH + path, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * Quick client registration: finds the ad accounts behind a Google Ads account number or a
 * Meta Business Manager / ad account ID, so the agency can create the client in one step.
 */
export const Route = createFileRoute("/api/integrations/client-lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAgencyAdmin(request);
        if (denied) return denied;
        const u = new URL(request.url);
        const provider = u.searchParams.get("provider");
        const id = (u.searchParams.get("id") ?? "").replace(/[\s.-]/g, "").replace(/^act_/i, "");
        if (provider === "google" && !/^\d{10}$/.test(id)) return Response.json({ error: "O número da conta Google tem 10 dígitos (ex.: 123-456-7890)." }, { status: 400, headers: noStore });
        if (provider === "meta" && !/^\d{5,20}$/.test(id)) return Response.json({ error: "Informe o ID numérico da BM ou da conta de anúncios da Meta." }, { status: 400, headers: noStore });
        if (provider !== "google" && provider !== "meta") return Response.json({ error: "Plataforma inválida." }, { status: 400, headers: noStore });

        try {
          const db = await supabaseAdmin();
          let source: "conta" | "bm" = "conta";
          let title: string | null = null;
          let accounts: Array<Omit<Found, "linkedTo">> = [];

          if (provider === "google") {
            const { data } = await db.from("ad_accounts_catalog").select("account_id,name,currency").eq("provider", "google").eq("account_id", id).maybeSingle();
            if (!data) return Response.json({ error: "Essa conta não está na MCC da agência. Confira o número ou clique em “Atualizar contas” em Integrações." }, { status: 404, headers: noStore });
            const row = data as { account_id: string; name: string; currency: string | null };
            accounts = [{ provider: "google", account_id: row.account_id, name: row.name, currency: row.currency }];
            title = row.name;
          } else {
            const { data } = await db.from("ad_accounts_catalog").select("account_id,name,currency").eq("provider", "meta").eq("account_id", "act_" + id).maybeSingle();
            if (data) {
              const row = data as { account_id: string; name: string; currency: string | null };
              accounts = [{ provider: "meta", account_id: row.account_id, name: row.name, currency: row.currency }];
              title = row.name;
            } else {
              const token = (await agencyTokens()).meta;
              if (!token) return Response.json({ error: "A Meta não está conectada. Conecte em Integrações." }, { status: 409, headers: noStore });
              const fields = "id,name,currency";
              const bm = await graph<{ id?: string; name?: string }>(`${id}?fields=id,name`, token);
              const lists = bm?.id
                ? await Promise.all(["owned_ad_accounts", "client_ad_accounts"].map((edge) => graph<{ data?: Array<{ id?: string; name?: string; currency?: string }> }>(`${id}/${edge}?fields=${fields}&limit=100`, token)))
                : [];
              const fromBm = lists.flatMap((l) => l?.data ?? []).filter((a) => /^act_\d+$/.test(String(a.id ?? "")));
              if (fromBm.length) {
                source = "bm";
                title = bm?.name ?? null;
                const seen = new Set<string>();
                accounts = fromBm
                  .filter((a) => !seen.has(String(a.id)) && seen.add(String(a.id)))
                  .map((a) => ({ provider: "meta" as const, account_id: String(a.id), name: String(a.name ?? a.id), currency: a.currency ?? null }));
              } else {
                const acc = await graph<{ id?: string; name?: string; currency?: string }>(`act_${id}?fields=${fields}`, token);
                if (acc?.id) {
                  accounts = [{ provider: "meta", account_id: acc.id, name: String(acc.name ?? acc.id), currency: acc.currency ?? null }];
                  title = acc.name ?? null;
                } else
                  return Response.json(
                    {
                      error: bm?.id
                        ? "A BM foi encontrada, mas não tem contas de anúncio compartilhadas com a agência. Peça ao cliente para dar acesso às contas na BM da SCASE."
                        : "Não encontramos essa BM nem essa conta. Confira o ID e se o cliente deu acesso à BM da agência.",
                    },
                    { status: 404, headers: noStore },
                  );
              }
            }
          }

          // Accounts reached through a client's BM may not be in the agency catalogue yet.
          if (provider === "meta")
            await db.from("ad_accounts_catalog").upsert(accounts.map((a) => ({ provider: "meta", account_id: a.account_id, name: a.name, currency: a.currency })) as never, { onConflict: "provider,account_id", ignoreDuplicates: true });

          const { data: links } = await db
            .from("client_ad_accounts")
            .select("account_id,client_id,clients(name)")
            .eq("provider", provider)
            .in("account_id", accounts.map((a) => a.account_id));
          const linked = new Map(((links ?? []) as unknown as Array<{ account_id: string; client_id: string; clients: { name: string } | null }>).map((l) => [l.account_id, { id: l.client_id, name: l.clients?.name ?? "cliente" }]));
          const found: Found[] = accounts.map((a) => ({ ...a, linkedTo: linked.get(a.account_id) ?? null }));
          return Response.json({ provider, source, title, accounts: found }, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível consultar a conta.") }, { status: 503, headers: noStore });
        }
      },
    },
  },
});
