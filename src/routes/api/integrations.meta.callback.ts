import {createFileRoute} from "@tanstack/react-router";
import {timingSafeEqual} from "node:crypto";
import {adminUserId,saveMetaCredential} from "../../lib/ads-credentials.server";
import {config} from "../../lib/ads-oauth.server";
const response=(url:string)=>new Response(null,{status:302,headers:{"Location":url,"Cache-Control":"no-store","Set-Cookie":"scase_meta_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/meta; Max-Age=0"}});
export const Route=createFileRoute("/api/integrations/meta/callback")({server:{handlers:{GET:async({request})=>{
 const fail=(message:string)=>response("/dashboard?meta_error="+encodeURIComponent(message));
 if(!(await adminUserId(request)))return fail("Sessão administrativa expirada. Entre novamente.");
 const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 const cookie=request.headers.get("cookie")?.split(";").map(c=>c.trim()).find(c=>c.startsWith("scase_meta_oauth_state="))?.split("=")[1]||"";
 const a=Buffer.from(state),b=Buffer.from(cookie);
 if(!state||!cookie||a.length!==b.length||!timingSafeEqual(a,b))return fail("Validação de segurança da Meta não concluída.");
 if(!code)return fail("Autorização Meta cancelada ou não concedida.");
 try{
  const c=config("meta");
  const tokenUrl=new URL(c.tokenUrl);
  tokenUrl.searchParams.set("client_id",c.clientId);
  tokenUrl.searchParams.set("client_secret",c.clientSecret);
  tokenUrl.searchParams.set("redirect_uri",c.redirectUri);
  tokenUrl.searchParams.set("code",code);
  const result=await fetch(tokenUrl,{cache:"no-store"});
  if(!result.ok)throw Error("Token não autorizado.");
  const short=await result.json() as {access_token?:string;expires_in?:number};
  if(!short.access_token)throw Error("Token ausente.");
  const longUrl=new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  longUrl.searchParams.set("grant_type","fb_exchange_token");
  longUrl.searchParams.set("client_id",c.clientId);
  longUrl.searchParams.set("client_secret",c.clientSecret);
  longUrl.searchParams.set("fb_exchange_token",short.access_token);
  const longRes=await fetch(longUrl,{cache:"no-store"});
  const long=longRes.ok?await longRes.json() as {access_token?:string;expires_in?:number}:null;
  await saveMetaCredential(request,long?.access_token||short.access_token,long?.expires_in||short.expires_in||3600);
  return response("/dashboard?meta_connected=1");
 }catch{return fail("Não foi possível concluir a autorização da Meta. Confira as permissões e o aplicativo.");}
}}}});
