import { createFileRoute } from "@tanstack/react-router";
import { constantTimeEqual, exchangeCode, stateHash, type Provider } from "../../lib/ads-oauth.server";
import { isAuthenticatedAgencyAdmin, NOT_READY } from "../../lib/integration-security.server";

export const Route = createFileRoute("/api/integrations/$provider/callback")({
  server:{handlers:{GET:async ({request,params})=>{
    if(!(await isAuthenticatedAgencyAdmin(request)))return Response.json({error:NOT_READY},{status:403});
    const provider=params.provider as Provider;
    if(provider!=="google"&&provider!=="meta")return Response.json({error:"Unknown platform"},{status:404});
    const url=new URL(request.url);
    const state=url.searchParams.get("state")||"";
    const code=url.searchParams.get("code")||"";
    const cookies=request.headers.get("cookie")||"";
    const expected=cookies.split(";").map(c=>c.trim()).find(c=>c.startsWith(`scase_oauth_${provider}=`))?.split("=")[1]||"";
    if(!state||!code||!expected||!constantTimeEqual(stateHash(state),expected))return Response.json({error:"Invalid OAuth callback state"},{status:400});
    // Prevent token exposure: exchange only in server runtime, never return tokens to client.
    // Production requirement: atomically persist encrypted credentials against authenticated agency,
    // then clear state cookie. This callback deliberately refuses to complete before persistence exists.
    return Response.json({error:"Token persistence not configured. Authorization is not enabled yet."},{status:503,headers:{"set-cookie":`scase_oauth_${provider}=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/${provider}; Max-Age=0`}});
  }}}
});
