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
  const from=url.searchParams.get("from");
  const to=url.searchParams.get("to");
  const custom=from!==null||to!==null;
  if(custom&&(!from||!to||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to)||from>to||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||(Date.parse(to)-Date.parse(from))/86400000>365||to>new Date().toISOString().slice(0,10)))return Response.json({error:"Intervalo de datas inválido (máximo de 366 dias). "},{status:400});
  if(!/^\d{10}$/.test(customerId)||(!custom&&!["7","15","30","today"].includes(days)))
   return Response.json({error:"Selecione uma conta Google Ads válida e um período de 7, 15 ou 30 dias."},{status:400});
  try{
   const token=await googleAccessToken(request,refreshGoogleToken);
   const accounts=await googleAccounts(token) as Array<{results?:Array<{customerClient?:{id?:string|number}}>}>;
   const inMcc=accounts.some(batch=>(batch.results??[]).some(row=>String(row.customerClient?.id??"")===customerId));
   if(!inMcc)return Response.json({error:"Conta não vinculada diretamente à MCC da SCASE."},{status:403});
   const version=process.env["GOOGLE_ADS_API_VERSION"]||"v26";
   const now=new Date();
   const utcDay=(d:Date)=>d.toISOString().slice(0,10);
   const daysCount=days==="today"?1:Number(days);
   const start=custom?new Date(from+"T00:00:00Z"):new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
   if(!custom)start.setUTCDate(start.getUTCDate()-(daysCount-1));
   const end=custom?new Date(to+"T00:00:00Z"):new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
   const actualCount=Math.round((end.getTime()-start.getTime())/86400000)+1;
   const previousStart=new Date(start);previousStart.setUTCDate(previousStart.getUTCDate()-actualCount);
   const previousEnd=new Date(start);previousEnd.setUTCDate(previousEnd.getUTCDate()-1);
   const query=`SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.absolute_top_impression_percentage, metrics.interactions, metrics.phone_calls FROM campaign WHERE segments.date BETWEEN "${utcDay(previousStart)}" AND "${utcDay(end)}" ORDER BY segments.date DESC LIMIT 10000`;
   const result=await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,{
    method:"POST",headers:{authorization:"Bearer "+token,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},
    body:JSON.stringify({query}),cache:"no-store"
   });
   if(!result.ok)return Response.json({error:"A API do Google Ads não conseguiu consultar as campanhas dessa conta.",upstream_status:result.status},{status:502});
   const batches=await result.json() as Array<{results?:Array<{segments?:{date?:string};campaign?:{id?:string;name?:string;status?:string};metrics?:{costMicros?:string|number;impressions?:string|number;clicks?:string|number;conversions?:string|number;conversionsValue?:string|number;absoluteTopImpressionPercentage?:string|number;interactions?:string|number;phoneCalls?:string|number}}> }>;
   const results=batches.flatMap(b=>b.results??[]);
   const previous={cost:0,impressions:0,clicks:0,conversions:0,conversionValue:0};
   const grouped=new Map<string,{id:string;name:string;status:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number;interactions:number;phoneCalls:number;absoluteTopWeighted:number;absoluteTopImpressions:number}>();
   const daily=new Map<string,{day:string;current:number;impressions:number;clicks:number;conversions:number}>();
   for(const item of results){
    const id=String(item.campaign?.id??"");if(!id)continue;
    const itemDate=item.segments?.date??"";
    if(itemDate<utcDay(start)){
      previous.cost+=Number(item.metrics?.costMicros??0)/1e6;
      previous.impressions+=Number(item.metrics?.impressions??0);
      previous.clicks+=Number(item.metrics?.clicks??0);
      previous.conversions+=Number(item.metrics?.conversions??0);
      previous.conversionValue+=Number(item.metrics?.conversionsValue??0);
      continue;
    }
    const campaign=grouped.get(id)??{id,name:item.campaign?.name??"Campanha sem nome",status:item.campaign?.status??"UNKNOWN",cost:0,impressions:0,clicks:0,conversions:0,conversionValue:0,interactions:0,phoneCalls:0,absoluteTopWeighted:0,absoluteTopImpressions:0};
    const cost=Number(item.metrics?.costMicros??0)/1e6;
    campaign.cost+=cost;campaign.impressions+=Number(item.metrics?.impressions??0);campaign.clicks+=Number(item.metrics?.clicks??0);
    campaign.conversions+=Number(item.metrics?.conversions??0);campaign.interactions+=Number(item.metrics?.interactions??0);campaign.phoneCalls+=Number(item.metrics?.phoneCalls??0);campaign.conversionValue+=Number(item.metrics?.conversionsValue??0);
    const absoluteTop=item.metrics?.absoluteTopImpressionPercentage;
    if(absoluteTop!==undefined&&absoluteTop!==null&&Number.isFinite(Number(absoluteTop))){const impressions=Number(item.metrics?.impressions??0);campaign.absoluteTopWeighted+=Number(absoluteTop)*impressions;campaign.absoluteTopImpressions+=impressions;}
    grouped.set(id,campaign);
    const day=item.segments?.date;
    if(day){const current=daily.get(day)??{day,current:0,impressions:0,clicks:0,conversions:0};
      current.current+=cost;current.impressions+=Number(item.metrics?.impressions??0);current.clicks+=Number(item.metrics?.clicks??0);current.conversions+=Number(item.metrics?.conversions??0);daily.set(day,current);}
   }
   const campaigns=[...grouped.values()].map(c=>({...c,conversionRate:c.interactions>0?c.conversions/c.interactions:null,absoluteTopImpressionPercentage:c.absoluteTopImpressions>0?c.absoluteTopWeighted/c.absoluteTopImpressions:null})).sort((a,b)=>b.cost-a.cost);
   // Conversion actions are a separate, segmented query. Do not add these
   // values to total conversions: they are a breakdown of the existing metric.
   const conversionActions:Array<{campaignId:string;name:string;conversions:number}>=[];
   try {
    const actionQuery=`SELECT campaign.id, segments.conversion_action_name, metrics.conversions FROM campaign WHERE segments.date BETWEEN "${utcDay(start)}" AND "${utcDay(end)}" LIMIT 10000`;
    const actionResult=await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,{method:"POST",headers:{authorization:"Bearer "+token,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},body:JSON.stringify({query:actionQuery}),cache:"no-store"});
    if(!actionResult.ok)console.warn("[scase/google] Conversion-action breakdown unavailable",actionResult.status);
    if(actionResult.ok){
     const chunks=await actionResult.json() as Array<{results?:Array<{campaign?:{id?:string|number};segments?:{conversionActionName?:string};metrics?:{conversions?:string|number}}> }>;
     const byKey=new Map<string,{campaignId:string;name:string;conversions:number}>();
     for(const chunk of chunks)for(const row of chunk.results??[]){
      const campaignId=String(row.campaign?.id??"");
      if(!campaignId)continue;
      const name=row.segments?.conversionActionName?.trim()||"Ação de conversão sem nome";
      const key=campaignId+"::"+name;
      const entry=byKey.get(key)??{campaignId,name,conversions:0};
      entry.conversions+=Number(row.metrics?.conversions??0);
      byKey.set(key,entry);
     }
     conversionActions.push(...byKey.values().sort((a,b)=>b.conversions-a.conversions));
    }
   }catch(error){ console.warn("[scase/google] Conversion-action breakdown failed",error instanceof Error?error.message:"unknown"); }
   // Optional diagnostic segments; never block the main report if unavailable.
   const devices:Array<{campaignId:string;device:string;cost:number;clicks:number;conversions:number}>=[];
   const searchTerms:Array<{campaignId:string;term:string;cost:number;conversions:number}>=[];
   const fetchSegment=async(query:string)=>{
    const response=await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,{method:"POST",headers:{authorization:"Bearer "+token,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},body:JSON.stringify({query}),cache:"no-store"});
    if(!response.ok)return [];
    const batches=await response.json() as Array<{results?:Array<Record<string,unknown>>}>;
    return batches.flatMap(batch=>batch.results??[]);
   };
   try{
    const rows=await fetchSegment(`SELECT campaign.id, segments.device, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN "${utcDay(start)}" AND "${utcDay(end)}" LIMIT 10000`);
    const byDevice=new Map<string,{device:string;cost:number;clicks:number;conversions:number}>();
    for(const row of rows){
     const campaign= row.campaign as {id?:string|number}|undefined;
     const seg=row.segments as {device?:string}|undefined;
     const m=row.metrics as {costMicros?:string|number;clicks?:string|number;conversions?:string|number}|undefined;
     const id=String(campaign?.id??"");
     if(!id||!seg?.device)continue;
     const key=id+"::"+seg.device;
     const item=byDevice.get(key)??{device:seg.device,cost:0,clicks:0,conversions:0};
     item.cost+=Number(m?.costMicros??0)/1e6;item.clicks+=Number(m?.clicks??0);item.conversions+=Number(m?.conversions??0);
     byDevice.set(key,item);
    }
    devices.push(...[...byDevice].map(([key,value])=>({...value,campaignId:key.split("::")[0]})));
   }catch{}
   try{
    const rows=await fetchSegment(`SELECT campaign.id, search_term_view.search_term, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN "${utcDay(start)}" AND "${utcDay(end)}" AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 100`);
    for(const row of rows){
     const campaign=row.campaign as {id?:string|number}|undefined;
     const term=(row.searchTermView as {searchTerm?:string}|undefined)?.searchTerm;
     const m=row.metrics as {costMicros?:string|number;conversions?:string|number}|undefined;
     if(term&&campaign?.id)searchTerms.push({term,campaignId:String(campaign.id),cost:Number(m?.costMicros??0)/1e6,conversions:Number(m?.conversions??0)});
    }
   }catch{}
   // Performance Max does not use the ordinary Search campaign search_term_view.
   // Request campaign-level search insights when normal terms are unavailable.
   if(searchTerms.length===0){
    try{
     const rows=await fetchSegment(`SELECT campaign_search_term_insight.campaign_id, campaign_search_term_insight.category_label, metrics.conversions, metrics.clicks FROM campaign_search_term_insight WHERE segments.date BETWEEN "${utcDay(start)}" AND "${utcDay(end)}" AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 100`);
     for(const row of rows){
      const insight=row.campaignSearchTermInsight as {campaignId?:string|number;categoryLabel?:string}|undefined;
      const metrics=row.metrics as {conversions?:string|number}|undefined;
      const name=insight?.categoryLabel?.trim();
      if(!name||!insight?.campaignId)continue;
      const id=String(insight.campaignId);
      if(!grouped.has(id))continue;
      searchTerms.push({campaignId:id,term:name,cost:0,conversions:Number(metrics?.conversions??0)});
     }
    }catch{}
   }
   const dailySeries=[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day));
   return Response.json({customerId,days:days==="today"?"today":Number(days),campaigns,conversionActions,devices,searchTerms,dailySeries,previous,period:{start:utcDay(start),end:utcDay(end),previousStart:utcDay(previousStart),previousEnd:utcDay(previousEnd)}},{headers:{"cache-control":"private, no-store"}});
  }catch{return Response.json({error:"Não foi possível consultar campanhas. Confirme as permissões dessa conta."},{status:503})}
 }}}
});
