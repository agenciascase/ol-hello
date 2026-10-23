import {createFileRoute} from "@tanstack/react-router";
import {adminUserId,metaAccessToken} from "../../lib/ads-credentials.server";
export const Route=createFileRoute("/api/integrations/meta/campaigns")({server:{handlers:{GET:async({request})=>{
 if(!(await adminUserId(request)))return Response.json({error:"Acesso administrativo necessário."},{status:403});
 const u=new URL(request.url),id=u.searchParams.get("account_id")||"",from=u.searchParams.get("from")||"",to=u.searchParams.get("to")||"";
 if(!/^act_\d+$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return Response.json({error:"Conta ou período inválido."},{status:400});
 try{
  const token=await metaAccessToken(request);
  const accounts=await fetch("https://graph.facebook.com/v24.0/me/adaccounts?fields=id&limit=250",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(!accounts.ok)throw Error("Não foi possível validar a conta.");
  const own=await accounts.json() as {data?:Array<{id:string}>};
  if(!(own.data||[]).some(x=>x.id===id))return Response.json({error:"Conta de anúncios não autorizada."},{status:403});
  const items:Array<Record<string,unknown>>=[];
  let next=new URL("https://graph.facebook.com/v24.0/"+id+"/insights");
  next.searchParams.set("level","campaign");
  next.searchParams.set("fields","campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type");
  next.searchParams.set("time_range",JSON.stringify({since:from,until:to}));next.searchParams.set("limit","100");
  for(let i=0;i<10;i++){
   const res=await fetch(next.toString(),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   if(!res.ok)throw Error("A Meta não liberou a consulta às campanhas.");
   const payload=await res.json() as {data?:Array<Record<string,unknown>>;paging?:{next?:string}};
   items.push(...payload.data||[]);
   const page=payload.paging?.next;
   if(!page||!page.startsWith("https://graph.facebook.com/"))break;
   next=new URL(page);
  }
  const campaigns=items.map(c=>({
   id:String(c.campaign_id||""),name:String(c.campaign_name||""),cost:Number(c.spend||0),impressions:Number(c.impressions||0),
   reach:Number(c.reach||0),clicks:Number(c.clicks||0),linkClicks:Number(c.inline_link_clicks||0),
   ctr:Number(c.ctr||0),cpc:Number(c.cpc||0),cpm:Number(c.cpm||0),
   actions:Array.isArray(c.actions)?c.actions:[],costPerAction:Array.isArray(c.cost_per_action_type)?c.cost_per_action_type:[]
  }));
  return Response.json({campaigns,period:{start:from,end:to}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Não foi possível consultar campanhas Meta."},{status:503});}
}}}});
