import { createFileRoute } from "@tanstack/react-router";
import { decryptToken } from "../lib/ads-credentials.server";
import { MCC_CUSTOMER_ID, refreshGoogleToken, googleAccounts } from "../lib/ads-oauth.server";
type SecureShare={customer_id:string;customer_name:string;access_token_ciphertext:string;refresh_token_ciphertext:string|null;expires_at:string};
export const Route=createFileRoute("/api/google-live-report")({server:{handlers:{GET:async ({request})=>{
  const url=new URL(request.url);
  const token=url.searchParams.get("token")??"";
  const days=url.searchParams.get("days")??"30";
  if(!/^[0-9a-f]{64}$/.test(token)||!["today","7","30"].includes(days))return Response.json({error:"Link inválido."},{status:400});
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
    const period=days==="today"?"TODAY":`LAST_${days}_DAYS`;
    const query=`SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING ${period} ORDER BY metrics.cost_micros DESC LIMIT 100`;
    const response=await fetch(`https://googleads.googleapis.com/${version}/customers/${share.customer_id}/googleAds:searchStream`,{method:"POST",headers:{authorization:"Bearer "+access,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},body:JSON.stringify({query}),cache:"no-store"});
    if(!response.ok)return Response.json({error:"Não foi possível consultar o Google Ads."},{status:502});
    const batches=await response.json() as Array<{results?:Array<{campaign?:{id?:string;name?:string};metrics?:{costMicros?:number|string;impressions?:number|string;clicks?:number|string;conversions?:number|string}}> }>;
    const campaigns=batches.flatMap(b=>b.results??[]).map(r=>({id:String(r.campaign?.id??""),name:r.campaign?.name??"Campanha",cost:Number(r.metrics?.costMicros??0)/1e6,impressions:Number(r.metrics?.impressions??0),clicks:Number(r.metrics?.clicks??0),conversions:Number(r.metrics?.conversions??0)}));
    return Response.json({customerName:share.customer_name,days,campaigns},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch{return Response.json({error:"Não foi possível atualizar os dados. Tente novamente."},{status:503});}
}}}});
