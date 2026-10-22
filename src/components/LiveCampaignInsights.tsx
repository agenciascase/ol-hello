import {TrendingUp,Target,Lightbulb,AlertTriangle} from "lucide-react";
type C={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number};
const cash=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=(v:number)=>Math.round(v).toLocaleString("pt-BR");
export function LiveCampaignInsights({campaigns,period}:{campaigns:C[];period:string}){
 const total=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const topSpend=[...campaigns].sort((a,b)=>b.cost-a.cost)[0];
 const topConversions=[...campaigns].sort((a,b)=>b.conversions-a.conversions)[0];
 const noConversion=campaigns.filter(c=>c.cost>0&&c.conversions===0);
 const analysis=total.clicks>0?total.conversions>0?
 `As campanhas registraram ${num(total.clicks)} cliques e ${num(total.conversions)} conversões atribuídas no Google Ads, com investimento de ${cash(total.cost)}.`:
 `As campanhas registraram ${num(total.clicks)} cliques, mas nenhuma conversão atribuída no período. Vale conferir a configuração das ações de conversão e a qualidade do tráfego.`:
 `Foram registradas ${num(total.impressions)} impressões e ${num(total.clicks)} cliques no período. Ainda não há volume de cliques para avaliar a eficiência de conversão.`;
 const highlight=topConversions&&topConversions.conversions>0?
 `A campanha “${topConversions.name}” concentrou o maior volume de conversões (${num(topConversions.conversions)}). Compare o custo por conversão antes de ampliar a verba.`:
 topSpend?`“${topSpend.name}” recebeu o maior investimento (${cash(topSpend.cost)}). Avalie cliques e conversões para entender o retorno dessa distribuição.`:
 "Nenhuma campanha registrou resultados neste recorte.";
 const attention=noConversion.length>0?
 `${noConversion.length} campanha(s) tiveram investimento, mas nenhuma conversão atribuída. Verifique intenção da busca, página de destino e mensuração antes de propor ajustes.`:
 total.conversions>0?`Custo médio por conversão: ${cash(total.cost/total.conversions)}. Compare esse valor com a meta comercial do cliente para avaliar a eficiência.`:
 "Não há conversões suficientes neste período para avaliar o custo por resultado.";
 const recommendation=total.impressions>0?
 `Acompanhe CTR (${(100*total.clicks/total.impressions).toFixed(2).replace(".",",")}%) e CPC médio (${cash(total.clicks?total.cost/total.clicks:0)}) por campanha. Valide quais ações de conversão representam contatos ou vendas reais.`:
 "Confirme se as campanhas estão veiculando e se o intervalo selecionado contém dados.";
 const cards=[{title:"Panorama do período",body:analysis,Icon:TrendingUp},{title:"Destaque das campanhas",body:highlight,Icon:Target},{title:"Ponto de atenção",body:attention,Icon:AlertTriangle},{title:"Próximo passo",body:recommendation,Icon:Lightbulb}];
 return <section className="panel" style={{padding:24}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap",marginBottom:18}}><div><span className="eyebrow">LEITURA ESTRATÉGICA · DADOS REAIS</span><h2 style={{fontSize:"clamp(22px,2.3vw,31px)",lineHeight:1.15,margin:"8px 0 4px",fontWeight:800}}>O que os resultados estão mostrando?</h2><p style={{fontSize:13,opacity:.7}}>Análise objetiva das campanhas · ${period}</p></div><span className="pill">GOOGLE ADS</span></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>{cards.map(({title,body,Icon})=><article key={title} style={{border:"1px solid #dceae2",background:"#f5fbf7",borderRadius:13,padding:17}}><Icon size={20} color="#069665"/><h3 style={{fontSize:15,margin:"10px 0 8px",fontWeight:750}}>{title}</h3><p style={{fontSize:13,lineHeight:1.55}}>{body}</p></article>)}</div>
 <p style={{marginTop:12,fontSize:11,opacity:.65}}>Análise automatizada dos números exibidos. Não pressupõe crescimento ou queda sem comparar períodos equivalentes.</p>
 </section>;
}
