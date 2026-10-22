import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {LiveBI} from "@/components/LiveBI";
import "../performance.css";
export const Route=createFileRoute("/live/$token")({component:GoogleLiveReport});
function GoogleLiveReport(){
 const {token}=Route.useParams();
 const [days,setDays]=useState<"7"|"15"|"30">("30");
 const q=useQuery({queryKey:["scase-public-google-live",token,days],queryFn:async()=>{
  const r=await fetch("/api/google-live-report?token="+encodeURIComponent(token)+"&days="+days,{cache:"no-store"});
  const body=await r.json();if(!r.ok)throw new Error(body.error||"Link indisponível");
  return body as {customerName:string;campaigns:Array<{id:string;name:string;status:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number}>;dailySeries:Array<{day:string;current:number;impressions:number;clicks:number;conversions:number}>;previous:{cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number}};
 },staleTime:60000,refetchInterval:5*60*1000,retry:false});
 return <main className="perf appShell themeLight" style={{minHeight:"100vh",display:"block",background:"#f1f6f3"}}>
 <header style={{background:"#071b14",padding:"18px clamp(16px,4vw,60px)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
 <img src="/scase-logo-light.svg" alt="SCASE" style={{width:160,maxHeight:55,objectFit:"contain"}}/>
 <span style={{color:"#e6fff1",fontSize:13}}>SCASE Performance · Painel de acompanhamento</span>
 </header>
 <div style={{maxWidth:1480,margin:"0 auto",padding:"30px clamp(14px,3vw,42px)"}}>
 <div style={{display:"flex",alignItems:"end",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:24}}>
 <div><span className="eyebrow">RELATÓRIO DE PERFORMANCE · GOOGLE ADS</span><h1 style={{fontSize:"clamp(25px,3vw,39px)",fontWeight:800,margin:"8px 0"}}>{q.data?.customerName??"Acompanhamento de campanhas"}</h1><p style={{opacity:.72}}>Resultados reais com atualização automática a cada cinco minutos enquanto esta página estiver aberta.</p></div>
 <div style={{display:"flex",gap:8}}>{(["7","15","30"] as const).map(d=><button key={d} type="button" onClick={()=>setDays(d)} style={{background:days===d?"#06291c":"white",color:days===d?"white":"#12372a",border:"1px solid #d6e5da",borderRadius:10,padding:"10px 17px",fontWeight:700}}>{d} dias</button>)}</div></div>
 {q.isLoading?<section className="panel" style={{padding:30}}>Consultando os dados da campanha…</section>:q.isError?<section className="panel" style={{padding:30}}><h2>Relatório indisponível</h2><p>{q.error instanceof Error?q.error.message:"Não foi possível carregar os dados."}</p></section>:
 <LiveBI campaigns={q.data?.campaigns??[]} daily={q.data?.dailySeries??[]} client={q.data?.customerName??""} previous={q.data?.previous} period={days}/>}
 <footer style={{marginTop:28,textAlign:"center",fontSize:12,color:"#61776a"}}>SCASE Performance · Relatório de consulta · Dados fornecidos pelo Google Ads, sujeitos à atribuição da plataforma. Este link não concede acesso a outras contas.</footer>
 </div></main>;
}
