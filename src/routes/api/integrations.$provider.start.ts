import { createFileRoute } from "@tanstack/react-router";
import { authUrl, newState, stateHash, type Provider } from "../../lib/ads-oauth.server";
import { isAuthenticatedAgencyAdmin, NOT_READY } from "../../lib/integration-security.server";

export const Route = createFileRoute("/api/integrations/$provider/start")({
  server:{handlers:{GET:async ({request,params})=>{
    if(!(await isAuthenticatedAgencyAdmin(request))) return Response.json({error:NOT_READY},{status:403});
    const provider=params.provider as Provider;
    if(provider!=="google"&&provider!=="meta")return Response.json({error:"Unknown platform"},{status:404});
    const state=newState();
    const redirect=new Response(null,{status:302,headers:{location:authUrl(provider,state),"cache-control":"no-store"}});
    redirect.headers.append("Set-Cookie",`scase_oauth_${provider}=${stateHash(state)}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/${provider}; Max-Age=3600`);
    return redirect;
  }}}
});
