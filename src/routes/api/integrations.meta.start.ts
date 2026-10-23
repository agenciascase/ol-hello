import {createFileRoute} from "@tanstack/react-router";
import {randomBytes} from "node:crypto";
import {adminUserId} from "../../lib/ads-credentials.server";
import {authUrl} from "../../lib/ads-oauth.server";
export const Route=createFileRoute("/api/integrations/meta/start")({server:{handlers:{GET:async({request})=>{
 if(!(await adminUserId(request)))return Response.json({error:"Acesso administrativo necessário."},{status:403});
 const state=randomBytes(24).toString("hex");
 const headers=new Headers({"Cache-Control":"no-store","Set-Cookie":"scase_meta_oauth_state="+state+"; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/meta; Max-Age=600"});
 try{return Response.redirect(authUrl("meta",state),302,{headers} as never)}catch{return Response.json({error:"Credenciais Meta não configuradas."},{status:503})}
}}}});
