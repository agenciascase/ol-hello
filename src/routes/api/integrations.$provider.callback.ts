import { createFileRoute } from "@tanstack/react-router";
import { constantTimeEqual, exchangeCode, stateHash, type Provider } from "../../lib/ads-oauth.server";
import { isAuthenticatedAgencyAdmin, NOT_READY } from "../../lib/integration-security.server";
import { decryptToken, adminUserId, saveGoogleCredential } from "../../lib/ads-credentials.server";

export const Route=createFileRoute("/api/integrations/$provider/callback")({
 server:{handlers:{GET:async ({request,params})=>{
  const provider=params.provider as Provider;
  if(provider!=="google")return Response.json({error:"Integração Meta ainda não disponível."},{status:503});
  const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
  if(!state||!code)return Response.json({error:"Retorno Google incompleto."},{status:400});
  const cookies=request.headers.get("cookie")||"";
  const expected=cookies.split(";").map(c=>c.trim()).find(c=>c.startsWith("scase_oauth_google="))?.slice("scase_oauth_google=".length)||"";
  if(expected&&!constantTimeEqual(stateHash(state),expected))return Response.json({error:"Estado OAuth inválido"},{status:400});
  let session:string;
  try{
   const payload=JSON.parse(decryptToken(state)) as {v:number;iat:number;nonce:string;session:string};
   if(payload.v!==1||!Number.isFinite(payload.iat)||payload.iat>Date.now()+60000||Date.now()-payload.iat>3600000||!payload.nonce||typeof payload.session!=="string")throw new Error("invalid");
   session=payload.session;
  }catch{return Response.json({error:"Estado OAuth inválido ou expirado. Reinicie a conexão."},{status:400});}
  // Revalidate the signed-in administrator with the original JWT after Google
  // redirects, even if the browser did not return its session cookie.
  const headers=new Headers(request.headers);headers.set("authorization","Bearer "+session);
  const authenticatedRequest=new Request(request,{headers});
  if(!(await isAuthenticatedAgencyAdmin(authenticatedRequest)))return Response.json({error:NOT_READY,step:"oauth_admin_validation"},{status:403});
  const userId=await adminUserId(authenticatedRequest);
  if(!userId)return Response.json({error:"Sessão administrativa inválida ou expirada. Entre novamente no painel."},{status:403});
  let tokens: {access_token:string;refresh_token?:string;expires_in?:number};
  try { tokens=await exchangeCode("google",code); }
  catch { return Response.json({error:"O Google não concluiu a troca do código de autorização.",step:"oauth_token_exchange"},{status:502}); }
  try {
    await saveGoogleCredential(authenticatedRequest,tokens);
  } catch (error) {
    const detail=error instanceof Error?error.message:"unknown";
    const step=detail.includes("lookup")?"oauth_storage_read":detail.includes("refresh token")?"oauth_missing_refresh_token":detail.includes("storage")?"oauth_storage_write":detail.includes("encryption")?"oauth_encryption_config":"oauth_storage_config";
    console.error("[scase/oauth] secure storage failed",step,detail.replace(/Bearer\\s+\\S+/g,"Bearer [redacted]"));
    return Response.json({error:"Falha ao armazenar a autorização com segurança.",step},{status:503});
  }
  // Credentials have already been stored successfully; never fail OAuth because
  // of a cosmetic redirect. Use a same-origin relative Location header.
  const response=new Response(null,{status:303,headers:{
    "Location":"/integracoes?conectado=google",
    "Cache-Control":"no-store"
  }});
  response.headers.append("Set-Cookie","scase_oauth_google=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/google; Max-Age=0");
  return response;
 }}}
});
