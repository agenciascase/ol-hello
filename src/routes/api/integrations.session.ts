import { createFileRoute } from "@tanstack/react-router";
import { isAuthenticatedAgencyAdmin, sessionCookieName, NOT_READY } from "../../lib/integration-security.server";
export const Route=createFileRoute("/api/integrations/session")({
 server:{handlers:{POST:async ({request})=>{
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin)return Response.json({error:"Origem não autorizada"},{status:403});
  if(!(await isAuthenticatedAgencyAdmin(request)))return Response.json({error:NOT_READY},{status:403});
  const jwt=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt)return Response.json({error:"Sessão não encontrada"},{status:401});
  const cookie=sessionCookieName()+"="+jwt+"; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations; Max-Age=600";
  return Response.json({ok:true},{headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
 }}}
});
