import {TrendingUp,Target,Lightbulb,AlertTriangle} from "lucide-react";
type C={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number};
type Totals={cost:number;impressions:number;clicks:number;conversions:number};
const cash=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=(v:number)=>Math.round(v).toLocaleString("pt-BR");
const change=(a:number,b:number)=>b>0?(a>=b?"+":"")+((a-b)/b*100).toFixed(1).replace(".",",")+"%":null;
export function LiveCampaignInsights({campaigns,period,previous}:{campaigns:C[];period:string;previous?:Totals}){
 const total=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const leading=[...campaigns].filter(c=>c.conversions>0).sort((a,b)=>b.conversions-a.conversions)[0];
 const costly=campaigns.filter(c=>c.cost>0&&c.conversions===0);
 const hasData=total.impressions>0||total.clicks>0||total.cost>0;
 const summary=hasData?`No período, investimos ${cash(total.cost)}, tivemos ${num(total.clicks)} cliques e ${num(total.conversions)} conversões registradas no Google Ads. O CPC ficou em ${cash(total.clicks?total.cost/total.clicks:0)}.`:
 "Não há movimento registrado para esse cliente no período selecionado. Confira outro intervalo antes de tirar conclusões.";
 const positive=leading?`A campanha “${leading.name}” foi a que mais trouxe conversões: ${num(leading.conversions)}. Vale olhar o custo de cada resultado antes de aumentar o orçamento.`:
 total.clicks>0?`O tráfego chegou: foram ${num(total.clicks)} cliques. Agora precisamos conferir se os contatos estão sendo registrados como conversões corretamente.`:
 "Sem dados suficientes para apontar um destaque de campanha.";
 const alert=costly.length?`${costly.length} campanha(s) consumiram orçamento e não registraram conversões. Vamos revisar termos de busca, anúncio, página de destino e medição dos contatos.`:
 total.conversions>0?`O custo médio por conversão ficou em ${cash(total.cost/total.conversions)}. Precisamos comparar isso com a meta comercial para dizer se está bom.`:
 "Ainda não temos conversões suficientes para afirmar que as campanhas estão entregando resultado.";
 const comparison=previous&&previous.clicks>0?change(total.clicks,previous.clicks):null;
 const next=comparison?`Em relação aos ${period} dias anteriores, os cliques variaram ${comparison}. Vamos acompanhar se essa mudança também aparece nas conversões, não só no volume de tráfego.`:
 "Vamos acompanhar cliques, conversões e custo por resultado juntos. Sem uma base comparável, não faz sentido afirmar que melhorou ou piorou.";
 const cards=[{title:"Como foi o período",body:summary,Icon:TrendingUp},{title:"O que funcionou",body:positive,Icon:Target},{title:"O que podemos melhorar",body:alert,Icon:AlertTriangle},{title:"Próximos ajustes",body:next,Icon:Lightbulb}];
 return <section className="panel" style={{padding:24}}>
 <span className="eyebrow">ANÁLISE DA SCASE · GOOGLE ADS</span><h2 style={{fontSize:"clamp(23px,2.4vw,30px)",lineHeight:1.18,fontWeight:800,margin:"8px 0 6px"}}>Como foram as campanhas neste período?</h2>
 <p style={{fontSize:13,opacity:.72,marginBottom:18}}>Leitura prática dos resultados · últimos ${period} dias</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>{cards.map(({title,body,Icon})=><article key={title} style={{border:"1px solid #dceae2",background:"#f5fbf7",borderRadius:13,padding:17}}><Icon size={19} color="#069665"/><h3 style={{fontSize:15,margin:"10px 0 8px",fontWeight:750}}>{title}</h3><p style={{fontSize:13,lineHeight:1.55}}>{body}</p></article>)}</div>
 <p style={{fontSize:11,opacity:.7,marginTop:14}}>Conversões são as ações registradas pelo Google Ads; não necessariamente vendas ou leads confirmados. Sem metas de negócio ou dados de CRM, não atribuímos resultados comerciais.</p>
 </section>;
}
