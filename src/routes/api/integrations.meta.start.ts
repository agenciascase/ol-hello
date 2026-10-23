import {createFileRoute} from "@tanstack/react-router";
import {randomBytes} from "node:crypto";
import {adminUserId} from "../../lib/ads-credentials.server";
import {authUrl} from "../../lib/ads-oauth.server";
import {sessionCookieName} from "../../lib/integration-security.server";
export const Route=createFileRoute("/api/integrations/meta/start")({server:{handlers:{
 POST:async({request})=>{
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin)return Response.json({error:"Origem não autorizada."},{status:403});
  const jwt=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt||!(await adminUserId(request)))return Response.json({error:"Sua sessão administrativa não foi autorizada. Confirme seu acesso à SCASE."},{status:403});
  try{
   const state=randomBytes(24).toString("hex");
   const headers=new Headers({"Cache-Control":"no-store"});
   headers.append("Set-Cookie",sessionCookieName()+"="+jwt+"; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations; Max-Age=3600");
   headers.append("Set-Cookie","scase_meta_oauth_state="+state+"; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/meta; Max-Age=600");
   return Response.json({url:authUrl("meta",state)},{headers});
  }catch{return Response.json({error:"Configuração Meta indisponível. Confira os Secrets."},{status:503})}
 }
}}});