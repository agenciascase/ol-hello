/**
 * Fail-closed integration authorization.
 * Wire this to the eventual real agency authentication and DB-backed role checks.
 * IMPORTANT: frontend demo role toggle does NOT count as authentication.
 */
export async function isAuthenticatedAgencyAdmin(_request: Request): Promise<boolean> {
  return false;
}
export const NOT_READY = "Integração bloqueada até a ativação de login administrativo seguro e armazenamento criptografado.";
