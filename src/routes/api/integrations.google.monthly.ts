import { createFileRoute } from "@tanstack/react-router";
import { adminUserId,googleAccessToken } from "../../lib/ads-credentials.server";
import { googleHeaders,googleAccounts,refreshGoogleToken } from "../../lib/ads-oauth.server";
export const Route=createFileRoute("/api/integrations/google/monthly")({server:{handlers:{GET:async ({request})=>{
 if(!(await adminUserId(request)))return Response.json({error:"Administrador não autorizado"},{status:403});
 const params=new URL(request.url).searchParams;
 const customerId=params.get("customer_id")??"";
 const campaignId=params.get("campaign_id")??"";
 if(!/^\d{10}$/.test(customerId)||(campaignId!==""&&!/^\d+$/.test(campaignId)))return Response.json({error:"Conta inválida"},{status:400});
 try{
 const access=await googleAccessToken(request,refreshGoogleToken);
 const accounts=await googleAccounts(access) as Array<{results?:Array<{customerClient?:{id?:string|number}}> }>;
 if(!accounts.some(b=>(b.results??[]).some(r=>String(r.customerClient?.id??"")===customerId)))return Response.json({error:"Conta fora da MCC SCASE"},{status:403});
 const today=new Date();
 const end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0));
 const start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-5,1));
 const iso=(date:Date)=>date.toISOString().slice(0,10);
 const query=campaignId
  ? `SELECT segments.month, campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE campaign.id = ${campaignId} AND segments.date BETWEEN "${iso(start)}" AND "${iso(end)}"`
  : `SELECT segments.month, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM customer WHERE segments.date BETWEEN "${iso(start)}" AND "${iso(end)}"`;
 const version=process.env["GOOGLE_ADS_API_VERSION"]||"v26";
 const response=await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,{method:"POST",headers:googleHeaders(access),body:JSON.stringify({query}),cache:"no-store"});
 if(!response.ok)return Response.json({error:"Não foi possível consultar a evolução mensal.",upstream_status:response.status},{status:502});
 const batches=await response.json() as Array<{results?:Array<{segments?:{month?:string};metrics?:{costMicros?:number|string;impressions?:number|string;clicks?:number|string;conversions?:number|string}}> }>;
 const records=new Map<string,{month:string;cost:number;impressions:number;clicks:number;conversions:number}>();
 for(let i=0;i<6;i++){const d=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-5+i,1));const month=iso(d);records.set(month,{month,cost:0,impressions:0,clicks:0,conversions:0});}
 for(const item of batches.flatMap(b=>b.results??[])){const month=item.segments?.month;if(!month||!records.has(month))continue;const m=records.get(month)!;m.cost+=Number(item.metrics?.costMicros??0)/1e6;m.impressions+=Number(item.metrics?.impressions??0);m.clicks+=Number(item.metrics?.clicks??0);m.conversions+=Number(item.metrics?.conversions??0);}
 return Response.json({months:[...records.values()]},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Não foi possível carregar evolução mensal."},{status:503})}
}}}});
