/**
 * Confere se um pedido que altera algo veio do próprio site (proteção contra outro site
 * fazer o pedido no nome de quem está logado).
 *
 * Na Hostinger o servidor fica atrás de um intermediário: o endereço que ele enxerga
 * (request.url) pode ser http:// ou localhost, enquanto o navegador manda
 * Origin: https://hub.agenciascase.com.br. Por isso valem: o endereço oficial (APP_ORIGIN),
 * o endereço que o servidor enxerga e o domínio pedido pelo navegador (Host / X-Forwarded-Host) em https.
 */
export function origensPermitidas(request: Request) {
  const ok = new Set<string>();
  try {
    ok.add(new URL(request.url).origin);
  } catch {
    /* sem endereço */
  }
  const app = (process.env["APP_ORIGIN"] ?? "").trim().replace(/\/+$/, "");
  if (app) ok.add(app);
  for (const h of [request.headers.get("x-forwarded-host"), request.headers.get("host")]) {
    const host = h?.split(",")[0]?.trim();
    if (host) ok.add(`https://${host}`);
  }
  return ok;
}

/** true quando o pedido veio do próprio site. Sem cabeçalho Origin: só aceita se `semOrigemOk`. */
export function origemDoSite(request: Request, semOrigemOk = false) {
  const origin = request.headers.get("origin");
  if (!origin) return semOrigemOk;
  return origensPermitidas(request).has(origin.replace(/\/+$/, ""));
}
