import {createFileRoute} from "@tanstack/react-router";
import {adminUserId,metaAccessToken} from "../../lib/ads-credentials.server";
export const Route=createFileRoute("/api/integrations/meta/accounts")({server:{handlers:{GET:async({request})=>{
 if(!(await adminUserId(request)))return Response.json({error:"Acesso restrito."},{status:403});
 try{
  const token=await metaAccessToken(request),data:Array<{id:string;name:string;account_id:string;currency?:string;account_status?:number}>=[];
  let next="https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_id,currency,account_status&limit=100";
  for(let n=0;n<5&&next;n++){
   const res=await fetch(next,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   if(!res.ok)throw Error("Meta recusou a consulta às contas.");
   const result=await res.json() as {data?:typeof data;paging?:{next?:string}};
   data.push(...result.data??[]);
   next=result.paging?.next?.startsWith("https://graph.facebook.com/")?result.paging.next:"";
  }
  return Response.json({accounts:data},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Conexão Meta indisponível."},{status:503});}
}}}});
