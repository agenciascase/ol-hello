import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import "../performance.css";
export const Route=createFileRoute("/live/$token")({component:GoogleLiveReport});
function GoogleLiveReport(){
 const {token}=Route.useParams();
 const [days,setDays]=useState<"today"|"7"|"30">("30");
 const q=useQuery({queryKey:["scase-public-google-live",token,days],queryFn:async()=>{
   const r=await fetch("/api/google-live-report?token="+encodeURIComponent(token)+"&days="+days,{cache:"no-store"});
   const body=await r.json();if(!r.ok)throw new Error(body.error||"Link indisponível");
   return body as {customerName:string;campaigns:Array<{id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number}>};
 },staleTime:60000,refetchInterval:5*60*1000,retry:false});
 const rows=q.data?.campaigns??[];
 const totals=rows.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
 const number=(n:number)=>Math.round(n).toLocaleString("pt-BR");
 return <main className="sharePage" style={{minHeight:"100vh"}}><header><img src="/scase-logo-light.svg" alt="SCASE"/><span>Acompanhamento de campanhas · Google Ads</span></header><div className="shareContent">
 <span className="eyebrow">SCASE PERFORMANCE · RESULTADOS REAIS</span><h1>{q.data?.customerName??"Acompanhamento de resultados"}</h1>
 <p>Atualização automática a cada 5 minutos enquanto esta página estiver aberta. Link restrito à conta compartilhada.</p>
 <div style={{display:"flex",gap:8,margin:"20px 0"}}>{(["today","7","30"] as const).map(d=><button key={d} type="button" onClick={()=>setDays(d)} style={{padding:"8px 16px",borderRadius:10,border:"1px solid #aaa"}}>{d==="today"?"Hoje":d==="7"?"7 dias":"30 dias"}</button>)}</div>
 {q.isLoading?<p>Consultando Google Ads…</p>:q.isError?<section className="shareError"><h2>Não foi possível carregar os resultados</h2><p>{q.error instanceof Error?q.error.message:"Erro de consulta."}</p></section>:
 <><div className="shareMetricGrid">{([["Investimento",money(totals.cost)],["Impressões",number(totals.impressions)],["Cliques",number(totals.clicks)],["CTR",(totals.impressions?totals.clicks/totals.impressions*100:0).toFixed(2)+"%"],["CPC",money(totals.clicks?totals.cost/totals.clicks:0)],["Conversões",number(totals.conversions)]] as const).map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
 <section style={{marginTop:28}}><h2>Campanhas</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left"}}><thead><tr><th>Campanha</th><th>Investimento</th><th>Cliques</th><th>Conversões</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td>{c.name}</td><td>{money(c.cost)}</td><td>{number(c.clicks)}</td><td>{number(c.conversions)}</td></tr>)}</tbody></table></div></section></>}
 <p className="shareFooter">Somente leitura. Métricas fornecidas pelo Google Ads, sujeitas ao tempo de atualização e às configurações de atribuição da plataforma.</p>
 </div></main>;
}
