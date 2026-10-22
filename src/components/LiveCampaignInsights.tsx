type Campaign={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number};
type Totals={cost:number;impressions:number;clicks:number;conversions:number};
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const number=(n:number)=>Math.round(n).toLocaleString("pt-BR");
const variation=(now:number,prior:number)=>prior>0?(now-prior)/prior*100:null;
const percent=(n:number)=>Math.abs(n).toFixed(1).replace(".",",")+"%";
export function LiveCampaignInsights({campaigns,period,previous}:{campaigns:Campaign[];period:string;previous?:Totals}){
 const totals=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const active=campaigns.filter(c=>c.cost>0);
 const leaders=[...active].filter(c=>c.conversions>0).sort((a,b)=>b.conversions-a.conversions);
 const top=leaders[0];
 const without=active.filter(c=>c.conversions===0);
 const clicksChange=previous?variation(totals.clicks,previous.clicks):null;
 const convChange=previous?variation(totals.conversions,previous.conversions):null;
 const costChange=previous?variation(totals.cost,previous.cost):null;
 const costPerResult=totals.conversions?totals.cost/totals.conversions:null;
 const comparison=clicksChange!==null&&convChange!==null?
 `Em relação ao período anterior, os cliques ${clicksChange>=0?"cresceram":"recuaram"} ${percent(clicksChange)} e as conversões ${convChange>=0?"aumentaram":"diminuíram"} ${percent(convChange)}.`:
 clicksChange!==null?`Na comparação com o período anterior, o volume de cliques ${clicksChange>=0?"subiu":"caiu"} ${percent(clicksChange)}.`:
 "Ainda não há uma base anterior comparável para medir a evolução com segurança.";
 const opening=totals.cost>0||totals.clicks>0?
 `No período analisado, as campanhas receberam ${money(totals.cost)} em investimento, geraram ${number(totals.clicks)} cliques e registraram ${number(totals.conversions)} conversões no Google Ads. ${comparison}`:
 "Neste intervalo não tivemos movimentação registrada no Google Ads. Antes de avaliar desempenho, vale confirmar a veiculação e ampliar o período de análise.";
 const reading=top?`A campanha “${top.name}” concentrou ${number(top.conversions)} conversões. Esse é o principal destaque do período em volume de resultados. ${costPerResult!==null?`No consolidado, o custo por conversão ficou em ${money(costPerResult)}.`:""}`:
 totals.clicks>0?"Os anúncios receberam tráfego, mas não houve conversões registradas. O primeiro ponto é conferir se as ações de conversão estão medindo corretamente os contatos.":"Ainda não temos volume para destacar uma campanha ou avaliar a eficiência.";
 const adjustment=without.length>0?`Vale revisar primeiro as ${number(without.length)} campanha(s) com investimento e nenhuma conversão registrada, observando termos de busca, anúncios e páginas de destino.`:
 costPerResult!==null?`O próximo passo é acompanhar se o custo por conversão de ${money(costPerResult)} está alinhado ao valor que o cliente considera viável por oportunidade.`:
 "A prioridade é validar o acompanhamento das conversões e entender o caminho entre o clique e o contato.";
 const priorities=[
 {title:"Eficiência",text:costPerResult!==null?`Acompanhar o custo por conversão (${money(costPerResult)}) e compará-lo à meta do negócio.`:"Conferir a mensuração de conversões antes de avaliar custo por resultado."},
 {title:"Otimização",text:without.length>0?"Revisar primeiro as campanhas que consumiram verba e não registraram conversões.":"Analisar consultas de pesquisa, anúncios e páginas das campanhas de maior volume."},
 {title:"Próxima avaliação",text:costChange!==null?`Conferir se a variação de investimento (${costChange>=0?"+":""}${costChange.toFixed(1).replace(".",",")}%) acompanha resultados e qualidade dos contatos.`:"Cruzar os contatos registrados no Google Ads com o retorno comercial e acompanhar o próximo período."}
 ];
 return <section className="panel" style={{padding:"clamp(20px,3vw,32px)",width:"100%"}}>
 <span className="eyebrow">ANÁLISE DE PERFORMANCE · SCASE</span>
 <h2 style={{fontSize:"clamp(24px,2.6vw,34px)",fontWeight:800,lineHeight:1.2,margin:"9px 0 8px"}}>Leitura do desempenho no período</h2>
 <p style={{fontSize:13,opacity:.7,marginBottom:20}}>O que os dados mostram e onde concentrar os próximos ajustes.</p>
 <div style={{display:"grid",gap:13,maxWidth:1100,fontSize:15,lineHeight:1.7}}>
 <p>{opening}</p><p>{reading}</p><p>{adjustment}</p>
 </div>
 <p style={{fontSize:11,opacity:.65,marginTop:17}}>Dados atribuídos pelo Google Ads. A avaliação de vendas e qualidade dos contatos depende das informações do atendimento comercial.</p>
 </section>;
}