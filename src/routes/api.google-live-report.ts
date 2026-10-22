import { createFileRoute } from "@tanstack/react-router";
import { decryptToken } from "../lib/ads-credentials.server";
import { MCC_CUSTOMER_ID, refreshGoogleToken, googleAccounts } from "../lib/ads-oauth.server";
type SecureShare={customer_id:string;customer_name:string;access_token_ciphertext:string;refresh_token_ciphertext:string|null;expires_at:string};
export const Route=createFileRoute("/api/google-live-report")({server:{handlers:{GET:async ({request})=>{
  const url=new URL(request.url);
  const token=url.searchParams.get("token")??"";
  const days=url.searchParams.get("days")??"30";
  if(!/^[0-9a-f]{64}$/.test(token)||!["today","7","15","30"].includes(days))return Response.json({error:"Link inválido."},{status:400});
  const base=(process.env["SUPABASE_URL"]??process.env["VITE_SUPABASE_URL"]??"").replace(/\/$/,"");
  const key=process.env["SUPABASE_PUBLISHABLE_KEY"]??process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]??"";
  if(!base||!key)return Response.json({error:"Serviço de consulta indisponível."},{status:503});
  const rs=await fetch(base+"/rest/v1/rpc/scase_read_live_google_share",{method:"POST",headers:{"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({p_token:token}),cache:"no-store"});
  if(!rs.ok)return Response.json({error:"Link indisponível. Confirme a migração de compartilhamento."},{status:503});
  const rows=await rs.json() as SecureShare[];
  const share=rows[0];if(!share)return Response.json({error:"Link expirado ou revogado."},{status:404});
  try {
    let access=decryptToken(share.access_token_ciphertext);
    if(Date.parse(share.expires_at)<Date.now()+60000){
      if(!share.refresh_token_ciphertext)throw new Error("Refresh unavailable");
      const fresh=await refreshGoogleToken(decryptToken(share.refresh_token_ciphertext));
      access=fresh.access_token;
    }
    const accounts=await googleAccounts(access) as Array<{results?:Array<{customerClient?:{id?:string|number}}> }>;
    if(!accounts.some(b=>(b.results??[]).some(r=>String(r.customerClient?.id??"")===share.customer_id)))
       return Response.json({error:"Conta não vinculada à MCC da SCASE."},{status:403});
    const version=process.env["GOOGLE_ADS_API_VERSION"]||"v26";
    const now=new Date();
    const count=days==="today"?1:Number(days);
    const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
    const start=new Date(end);start.setUTCDate(start.getUTCDate()-count+1);
    const previousStart=new Date(start);previousStart.setUTCDate(previousStart.getUTCDate()-count);
    const iso=(d:Date)=>d.toISOString().slice(0,10);
    const query=`SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN "${iso(previousStart)}" AND "${iso(end)}" ORDER BY segments.date DESC LIMIT 10000`;
    const response=await fetch(`https://googleads.googleapis.com/${version}/customers/${share.customer_id}/googleAds:searchStream`,{method:"POST",headers:{authorization:"Bearer "+access,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},body:JSON.stringify({query}),cache:"no-store"});
    if(!response.ok)return Response.json({error:"Não foi possível consultar o Google Ads."},{status:502});
    const batches=await response.json() as Array<{results?:Array<{segments?:{date?:string};campaign?:{id?:string;name?:string;status?:string};metrics?:{costMicros?:number|string;impressions?:number|string;clicks?:number|string;conversions?:number|string;conversionsValue?:number|string}}> }>;
    type Row={id:string;name:string;status:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number};
    const grouped=new Map<string,Row>();
    const daily=new Map<string,{day:string;current:number;impressions:number;clicks:number;conversions:number}>();
    const previous={cost:0,impressions:0,clicks:0,conversions:0,conversionValue:0};
    for(const item of batches.flatMap(b=>b.results??[])){
      const date=item.segments?.date??"";
      const cost=Number(item.metrics?.costMicros??0)/1e6,impressions=Number(item.metrics?.impressions??0),clicks=Number(item.metrics?.clicks??0),conversions=Number(item.metrics?.conversions??0),conversionValue=Number(item.metrics?.conversionsValue??0);
      if(date<iso(start)){previous.cost+=cost;previous.impressions+=impressions;previous.clicks+=clicks;previous.conversions+=conversions;previous.conversionValue+=conversionValue;continue;}
      const id=String(item.campaign?.id??"");if(!id)continue;
      const row=grouped.get(id)??{id,name:item.campaign?.name??"Campanha",status:item.campaign?.status??"UNKNOWN",cost:0,impressions:0,clicks:0,conversions:0,conversionValue:0};
      row.cost+=cost;row.impressions+=impressions;row.clicks+=clicks;row.conversions+=conversions;row.conversionValue+=conversionValue;grouped.set(id,row);
      if(date){const dr=daily.get(date)??{day:date,current:0,impressions:0,clicks:0,conversions:0};dr.current+=cost;dr.impressions+=impressions;dr.clicks+=clicks;dr.conversions+=conversions;daily.set(date,dr);}
    }
    return Response.json({customerName:share.customer_name,days,campaigns:[...grouped.values()].sort((a,b)=>b.cost-a.cost),dailySeries:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)),previous},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch{return Response.json({error:"Não foi possível atualizar os dados. Tente novamente."},{status:503});}
}}}});
