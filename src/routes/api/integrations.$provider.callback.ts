import { createFileRoute } from "@tanstack/react-router";
import { constantTimeEqual, exchangeCode, stateHash, type Provider } from "../../lib/ads-oauth.server";
import { isAuthenticatedAgencyAdmin, NOT_READY } from "../../lib/integration-security.server";
import { adminUserId, saveGoogleCredential } from "../../lib/ads-credentials.server";
export const Route=createFileRoute("/api/integrations/$provider/callback")({
 server:{handlers:{GET:async ({request,params})=>{
  if(!(await isAuthenticatedAgencyAdmin(request)))return Response.json({error:NOT_READY},{status:403});
  const provider=params.provider as Provider;
  if(provider!=="google")return Response.json({error:"Integração Meta ainda não disponível."},{status:503});
  const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
  const cookie=request.headers.get("cookie")||"";
  const expected=cookie.split(";").map(c=>c.trim()).find(c=>c.startsWith("scase_oauth_google="))?.split("=")[1]||"";
  if(!state||!code||!expected||!constantTimeEqual(stateHash(state),expected))return Response.json({error:"Estado OAuth inválido"},{status:400});
  const userId=await adminUserId(request);
  if(!userId)return Response.json({error:"Sessão inválida"},{status:403});
  try{
    const tokens=await exchangeCode("google",code);
    await saveGoogleCredential(request,tokens);
    const origin=process.env["APP_ORIGIN"]?.replace(/\/$/,"")??url.origin;
    const response=Response.redirect(origin+"/dashboard?google_connected=1",302);
    response.headers.append("Set-Cookie","scase_oauth_google=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/google; Max-Age=0");
    return response;
  }catch{return Response.json({error:"Não foi possível salvar a autorização Google com segurança."},{status:503})}
 }}}
});
