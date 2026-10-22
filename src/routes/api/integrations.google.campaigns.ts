import { createFileRoute } from "@tanstack/react-router";
import { adminUserId, googleAccessToken } from "../../lib/ads-credentials.server";
import { MCC_CUSTOMER_ID, googleAccounts, refreshGoogleToken } from "../../lib/ads-oauth.server";

// Server-only, administrator-only, read-only Google Ads campaign metrics.
export const Route = createFileRoute("/api/integrations/google/campaigns")({
 server:{handlers:{GET:async ({request})=>{
  if(!(await adminUserId(request)))return Response.json({error:"Administrador não autorizado"},{status:403});
  const url=new URL(request.url);
  const customerId=url.searchParams.get("customer_id")??"";
  const days=url.searchParams.get("days")??"30";
  if(!/^\d{10}$/.test(customerId)||!["7","30","today"].includes(days))
   return Response.json({error:"Selecione uma conta Google Ads válida e um período de 7 ou 30 dias."},{status:400});
  try{
   const token=await googleAccessToken(request,refreshGoogleToken);
   const accounts=await googleAccounts(token) as Array<{results?:Array<{customerClient?:{id?:string|number}}>}>;
   const inMcc=accounts.some(batch=>(batch.results??[]).some(row=>String(row.customerClient?.id??"")===customerId));
   if(!inMcc)return Response.json({error:"Conta não vinculada diretamente à MCC da SCASE."},{status:403});
   const version=process.env["GOOGLE_ADS_API_VERSION"]||"v26";
   const period=days==="today"?"TODAY":`LAST_${days}_DAYS`;
   const query=`SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING ${period} ORDER BY segments.date DESC LIMIT 10000`;
   const result=await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,{
    method:"POST",headers:{authorization:"Bearer "+token,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},
    body:JSON.stringify({query}),cache:"no-store"
   });
   if(!result.ok)return Response.json({error:"A API do Google Ads não conseguiu consultar as campanhas dessa conta.",upstream_status:result.status},{status:502});
   const batches=await result.json() as Array<{results?:Array<{segments?:{date?:string};campaign?:{id?:string;name?:string;status?:string};metrics?:{costMicros?:string|number;impressions?:string|number;clicks?:string|number;conversions?:string|number;conversionsValue?:string|number}}> }>;
   const results=batches.flatMap(b=>b.results??[]);
   const grouped=new Map<string,{id:string;name:string;status:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number}>();
   const daily=new Map<string,{day:string;current:number;impressions:number;clicks:number;conversions:number}>();
   for(const item of results){
    const id=String(item.campaign?.id??"");if(!id)continue;
    const campaign=grouped.get(id)??{id,name:item.campaign?.name??"Campanha sem nome",status:item.campaign?.status??"UNKNOWN",cost:0,impressions:0,clicks:0,conversions:0,conversionValue:0};
    const cost=Number(item.metrics?.costMicros??0)/1e6;
    campaign.cost+=cost;campaign.impressions+=Number(item.metrics?.impressions??0);campaign.clicks+=Number(item.metrics?.clicks??0);
    campaign.conversions+=Number(item.metrics?.conversions??0);campaign.conversionValue+=Number(item.metrics?.conversionsValue??0);
    grouped.set(id,campaign);
    const day=item.segments?.date;
    if(day){const current=daily.get(day)??{day,current:0,impressions:0,clicks:0,conversions:0};
      current.current+=cost;current.impressions+=Number(item.metrics?.impressions??0);current.clicks+=Number(item.metrics?.clicks??0);current.conversions+=Number(item.metrics?.conversions??0);daily.set(day,current);}
   }
   const campaigns=[...grouped.values()].sort((a,b)=>b.cost-a.cost);
   const dailySeries=[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day));
   return Response.json({customerId,days:days==="today"?"today":Number(days),campaigns,dailySeries},{headers:{"cache-control":"private, no-store"}});
  }catch{return Response.json({error:"Não foi possível consultar campanhas. Confirme as permissões dessa conta."},{status:503})}
 }}}
});
