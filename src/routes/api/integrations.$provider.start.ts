import { createFileRoute } from "@tanstack/react-router";
import { authUrl, newState, stateHash, type Provider } from "../../lib/ads-oauth.server";
import { isAuthenticatedAgencyAdmin, NOT_READY } from "../../lib/integration-security.server";
import { encryptToken } from "../../lib/ads-credentials.server";

export const Route = createFileRoute("/api/integrations/$provider/start")({
  server:{handlers:{GET:async ({request,params})=>{
    if(!(await isAuthenticatedAgencyAdmin(request))) return Response.json({error:NOT_READY},{status:403});
    const provider=params.provider as Provider;
    if(provider!=="google") return Response.json({error:"Plataforma ainda não disponível."},{status:503});
    // OAuth redirects cross origins; preserve an encrypted and time-limited
    // admin context instead of relying solely on a browser session cookie.
    const session=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("scase_integration_session="))?.slice("scase_integration_session=".length);
    if(!session)return Response.json({error:"Sessão administrativa ausente. Faça login novamente."},{status:403});
    let state:string;
    try{state=encryptToken(JSON.stringify({v:1,iat:Date.now(),nonce:newState(),session}));}
    catch{return Response.json({error:"Configuração de criptografia indisponível."},{status:503});}
    const redirect=new Response(null,{status:302,headers:{location:authUrl(provider,state),"cache-control":"no-store"}});
    redirect.headers.append("Set-Cookie",`scase_oauth_${provider}=${stateHash(state)}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/${provider}; Max-Age=3600`);
    return redirect;
  }}}
});
