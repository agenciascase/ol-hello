/** Shared guards for the agency's admin-only API routes. */
import { isAuthenticatedAgencyAdmin, NOT_READY } from "./integration-security.server";

export const noStore = { "Cache-Control": "no-store" };

/** Returns a Response to send back when the caller is not an agency admin, or null when allowed. */
export async function requireAgencyAdmin(request: Request, opts: { mutating?: boolean } = {}): Promise<Response | null> {
  if (opts.mutating) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origem não autorizada" }, { status: 403, headers: noStore });
  }
  if (!(await isAuthenticatedAgencyAdmin(request))) return Response.json({ error: NOT_READY }, { status: 403, headers: noStore });
  return null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function supabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}
