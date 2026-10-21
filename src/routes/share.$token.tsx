import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import "../performance.css";
type SharedReport={client:string;campaign:string;period:string;metrics:{label:string;value:string}[];createdAt:string;demo:boolean};
export const Route=createFileRoute("/share/$token")({component:CampaignShare});
function CampaignShare(){
 const {token}=Route.useParams();
 const {data,isLoading,error}=useQuery({queryKey:["campaign-share",token],queryFn:async()=>{
  const result=await supabase.rpc("read_campaign_share" as never,{p_token:token} as never);
  if(result.error)throw result.error;
  return result.data as SharedReport|null;
 },refetchInterval:5*60*1000,staleTime:60*1000});
 return <main className="sharePage"><header><img src="/scase-logo-light.svg" alt="SCASE"/><span>Portal de acompanhamento • Somente leitura</span></header>
 {isLoading?<p>Carregando relatório…</p>:error||!data?<section className="shareError"><h1>Link indisponível</h1><p>Este link pode ter expirado, sido revogado ou não estar configurado.</p></section>:<div className="shareContent"><span className="eyebrow">SCASE PERFORMANCE</span><h1>{data.campaign}</h1><p>{data.client} · {data.period}</p>{data.demo&&<div className="shareDemo">Demonstração: os números não são dados reais ou em tempo real.</div>}<div className="shareMetricGrid">{data.metrics.map(m=><article key={m.label}><span>{m.label}</span><strong>{m.value}</strong></article>)}</div><p className="shareFooter">Relatório preparado em {new Date(data.createdAt).toLocaleString("pt-BR")}. Este link atualiza a visualização periodicamente, mas os dados são um retrato do momento em que o link foi criado. A sincronização com as APIs ainda precisa ser ativada.</p></div>}</main>;
}
