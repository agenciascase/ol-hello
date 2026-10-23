type Campaign={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number};
type Totals={cost:number;impressions:number;clicks:number;conversions:number};
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const number=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:2});
const variation=(now:number,prior:number)=>prior>0?(now-prior)/prior*100:null;
const percent=(n:number)=>Math.abs(n).toFixed(1).replace(".",",")+"%";
export function LiveCampaignInsights({campaigns,period,previous}:{campaigns:Campaign[];period:string;previous?:Totals}){
 const total=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const active=campaigns.filter(c=>c.cost>0);
 const leaders=[...active].filter(c=>c.conversions>0).sort((a,b)=>b.conversions-a.conversions);
 const best=leaders[0];
 const without=active.filter(c=>c.conversions===0);
 const ctr=total.impressions?total.clicks/total.impressions*100:null;
 const cpc=total.clicks?total.cost/total.clicks:null;
 const cpa=total.conversions?total.cost/total.conversions:null;
 const rate=total.clicks?total.conversions/total.clicks*100:null;
 const clicksChange=previous?variation(total.clicks,previous.clicks):null;
 const convChange=previous?variation(total.conversions,previous.conversions):null;
 const spendChange=previous?variation(total.cost,previous.cost):null;
 const summarize=(value:number|null,metric:string)=>value===null?"":` Na comparação com o período anterior, ${metric} ${value>=0?"aumentou":"recuou"} ${percent(value)}.`;
 const opening=total.cost>0||total.impressions>0?
 `Minha leitura deste período é que investimos ${money(total.cost)} para alcançar ${number(total.impressions)} impressões, ${number(total.clicks)} cliques e ${number(total.conversions)} conversões atribuídas pelo Google Ads. As impressões indicam quantas vezes os anúncios foram exibidos; os cliques representam os acessos gerados e as conversões mostram as ações que o Google Ads contabilizou como resultados.`:
 "Minha avaliação é que ainda não há movimentação suficiente neste período para concluir sobre o desempenho. Precisamos confirmar a veiculação e observar uma janela com dados consistentes.";
 const metrics=total.impressions>0||total.clicks>0?
 `Ao olhar a eficiência, o CTR (percentual de exibições que viraram cliques) ficou em ${ctr!==null?number(ctr)+"%":"—"} e o CPC médio (valor investido por clique) em ${cpc!==null?money(cpc):"—"}. ${cpa!==null?`O custo por conversão ficou em ${money(cpa)}, ou seja, o investimento médio necessário para cada ação registrada.`:"Como não houve conversões registradas, ainda não é possível calcular um custo por conversão representativo."} ${rate!==null?`A relação entre conversões e cliques foi de ${number(rate)}%; essa é uma referência calculada sobre os cliques, não necessariamente a taxa de conversão oficial do Google Ads.`:""}`:
 "Com a ausência de volume, indicadores como CTR, CPC e custo por conversão ainda não permitem uma interpretação útil.";
 const positive=best?
 `Entre os pontos positivos, destaco a campanha “${best.name}”, que registrou ${number(best.conversions)} conversões. Ela liderou em volume de ações atribuídas no período${leaders.length>1?", embora seja necessário avaliar também o custo e a qualidade de cada oportunidade para definir a melhor campanha.":"."}`:
 total.conversions>0?`Como ponto positivo, houve ${number(total.conversions)} conversões registradas. Vale cruzar essas ações com os contatos recebidos para entender sua qualidade.`:
 total.clicks>0?`O ponto positivo foi a geração de ${number(total.clicks)} cliques. Isso mostra que houve acessos aos anúncios, mas ainda precisamos confirmar se esse tráfego está chegando às ações desejadas.`:
 "Ainda não identifico um destaque positivo sustentado pelos dados desta janela.";
 const improvement=without.length>0?
 `Vejo espaço para melhoria nas ${number(without.length)} campanhas que receberam investimento sem registrar conversões. Minha recomendação é investigar segmentação, qualidade do tráfego, mensagens dos anúncios e experiência na página de destino, respeitando o tipo de cada campanha.`:
 total.clicks>0&&total.conversions===0?
 "O principal ponto de atenção é entender por que os acessos ainda não se transformaram em conversões registradas. Eu começaria verificando a mensuração e, depois, a adequação entre anúncios, público e destino do clique.":
 cpa!==null?`O ponto de melhoria é acompanhar a sustentabilidade do custo por conversão de ${money(cpa)}. Sem uma meta de custo por oportunidade e retorno comercial, não seria correto classificar esse valor, isoladamente, como alto ou baixo.`:
 "Meu próximo foco seria confirmar o funcionamento da mensuração e acompanhar a evolução quando houver mais dados.";
 const comparison=previous?
 `Na evolução frente ao período anterior equivalente, observo o seguinte:${summarize(spendChange,"o investimento")}${summarize(clicksChange,"o volume de cliques")}${summarize(convChange,"o número de conversões")} Essas variações precisam ser avaliadas em conjunto: mais tráfego não significa necessariamente mais oportunidades de qualidade.`:
 "";
 return <section className="panel" style={{padding:"clamp(20px,3vw,32px)",width:"100%"}}>
 <span className="eyebrow">VISÃO DO GESTOR · SCASE PERFORMANCE</span>
 <h2 style={{fontSize:"clamp(24px,2.6vw,34px)",fontWeight:800,lineHeight:1.2,margin:"9px 0 8px"}}>Leitura do desempenho no período</h2>
 <p style={{fontSize:13,opacity:.7,marginBottom:20}}>Análise estratégica dos números, oportunidades e próximos pontos de atenção.</p>
 <div style={{display:"grid",gap:15,maxWidth:1100,fontSize:15,lineHeight:1.75}}>
 <p>{opening}</p>
 <p>{metrics}</p>
 <p><strong>Pontos positivos. </strong>{positive}</p>
 <p><strong>Oportunidades de melhoria. </strong>{improvement}</p>
 {comparison&&<p><strong>Evolução dos resultados. </strong>{comparison}</p>}
 </div>
 <p style={{fontSize:11,opacity:.65,marginTop:17}}>Análise baseada nos indicadores do Google Ads; conversões atribuídas não representam necessariamente vendas concluídas. A qualidade dos contatos requer validação comercial.</p>
 </section>;
}
