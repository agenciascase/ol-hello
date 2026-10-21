import { createFileRoute } from "@tanstack/react-router";
import {adminUserId,googleAccessToken} from "../../lib/ads-credentials.server";
import {googleAccounts,refreshGoogleToken} from "../../lib/ads-oauth.server";
export const Route=createFileRoute("/api/integrations/google/accounts")({
 server:{handlers:{GET:async ({request})=>{
  const user=await adminUserId(request);
  if(!user)return Response.json({error:"Administrador não autorizado"},{status:403});
  try{
   const token=await googleAccessToken(user,refreshGoogleToken);
   const data=await googleAccounts(token);
   return Response.json({data},{headers:{"cache-control":"no-store"}});
  }catch{return Response.json({error:"Não foi possível consultar as contas. Confirme a conexão e as permissões da MCC."},{status:503})}
 }}}
});
