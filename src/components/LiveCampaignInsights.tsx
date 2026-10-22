type Campaign={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number};
type Totals={cost:number;impressions:number;clicks:number;conversions:number};
const money=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const count=(v:number)=>Math.round(v).toLocaleString("pt-BR");
const delta=(a:number,b:number)=>b>0?(a-b)/b*100:null;
const changeText=(d:number)=>Math.abs(d).toFixed(1).replace(".",",")+"%";
export function LiveCampaignInsights({campaigns,period,previous}:{campaigns:Campaign[];period:string;previous?:Totals}){
 const t=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,clicks:a.clicks+c.clicks,impressions:a.impressions+c.impressions,conversions:a.conversions+c.conversions}),{cost:0,clicks:0,impressions:0,conversions:0});
 const leader=[...campaigns].filter(c=>c.conversions>0).sort((a,b)=>b.conversions-a.conversions)[0];
 const without=campaigns.filter(c=>c.cost>0&&c.conversions===0);
 const changedClicks=previous?delta(t.clicks,previous.clicks):null;
 const changedConversions=previous?delta(t.conversions,previous.conversions):null;
 const hasActivity=t.cost>0||t.clicks>0||t.impressions>0;
 const overview=hasActivity?`Nos últimos ${period} dias, foram ${money(t.cost)} investidos, com ${count(t.clicks)} cliques e ${count(t.conversions)} conversões registradas no Google Ads. O CPC médio ficou em ${money(t.clicks?t.cost/t.clicks:0)}${t.conversions?` e o custo por conversão em ${money(t.cost/t.conversions)}`:""}.`:
 `Não há movimentação registrada nestes ${period} dias. Antes de avaliar os resultados, precisamos conferir se houve veiculação e se o intervalo está correto.`;
 const comparison=changedClicks!==null?`Comparando com os ${period} dias anteriores, os cliques ${changedClicks>=0?"subiram":"caíram"} ${changeText(changedClicks)}${changedConversions!==null?` e as conversões ${changedConversions>=0?"subiram":"caíram"} ${changeText(changedConversions)}`:""}. Isso mostra a variação de volume, mas o custo por resultado também precisa entrar na conta.`:
 "Não há base anterior suficiente para afirmar que o desempenho melhorou ou piorou.";
 const positive=leader?`O destaque foi a campanha “${leader.name}”, com ${count(leader.conversions)} conversões. É nela que vale aprofundar a análise para entender o que está trazendo resultado.`:
 t.clicks>0?"Tivemos acessos pelos anúncios. Precisamos conferir se as ações de conversão estão configuradas corretamente e se esses cliques estão gerando contatos.":"Ainda não há resultados suficientes para destacar uma campanha.";
 const improvement=without.length?`${without.length} campanha(s) tiveram investimento sem conversões registradas. O próximo ajuste é revisar termos de pesquisa, criativos, páginas de destino e mensuração, começando pelas campanhas de maior gasto.`:
 t.conversions?`Vamos acompanhar o custo por conversão de ${money(t.cost/t.conversions)} e validar com a equipe comercial se esses contatos têm qualidade antes de aumentar a verba.`:
 "O foco agora é confirmar a mensuração das conversões e entender por que o tráfego não está virando resultado registrado.";
 return <section className="panel" style={{padding:"clamp(20px,3vw,32px)",width:"100%"}}>
 <span className="eyebrow">ANÁLISE DA SCASE · RESULTADOS REAIS</span>
 <h2 style={{fontSize:"clamp(25px,2.6vw,34px)",fontWeight:800,lineHeight:1.18,margin:"9px 0 8px"}}>Como foram as campanhas neste período?</h2>
 <p style={{fontSize:13,opacity:.7,marginBottom:22}}>Uma leitura direta dos últimos ${period} dias, com os principais números e próximos ajustes.</p>
 <div style={{maxWidth:1050,display:"grid",gap:16,lineHeight:1.7,fontSize:15}}>
 <p>{overview} {comparison}</p>
 <p><strong>O que funcionou: </strong>{positive}</p>
 <p><strong>O que podemos melhorar: </strong>{improvement}</p>
 </div>
 <p style={{marginTop:22,paddingTop:13,borderTop:"1px solid #e0eae4",fontSize:12,opacity:.65}}>Conversões são registros atribuídos pelo Google Ads, não necessariamente vendas ou leads validados pelo comercial.</p>
 </section>;
}