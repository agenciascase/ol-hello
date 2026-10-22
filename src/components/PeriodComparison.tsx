type Campaign={cost:number;clicks:number;impressions:number;conversions:number};
type Totals={cost:number;clicks:number;impressions:number;conversions:number};
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const qty=(n:number)=>Math.round(n).toLocaleString("pt-BR");
const pct=(n:number)=>(n>=0?"+":"")+n.toFixed(1).replace(".",",")+"%";
export function PeriodComparison({campaigns,previous,period}:{campaigns:Campaign[];previous?:Totals;period:string}){
 const current=campaigns.reduce((a,c)=>({cost:a.cost+c.cost,clicks:a.clicks+c.clicks,impressions:a.impressions+c.impressions,conversions:a.conversions+c.conversions}),{cost:0,clicks:0,impressions:0,conversions:0});
 const old=previous;
 const rows=[
 {title:"Investimento",now:current.cost,before:old?.cost,fmt:money,lowerBetter:false},
 {title:"Cliques",now:current.clicks,before:old?.clicks,fmt:qty,lowerBetter:false},
 {title:"Conversões registradas",now:current.conversions,before:old?.conversions,fmt:qty,lowerBetter:false},
 {title:"Custo por conversão",now:current.conversions?current.cost/current.conversions:null,before:old&&old.conversions?old.cost/old.conversions:null,fmt:money,lowerBetter:true}
 ];
 return <section className="panel" style={{padding:"clamp(20px,3vw,32px)"}}>
 <span className="eyebrow">COMPARATIVO DO DESEMPENHO</span>
 <h2 style={{fontSize:"clamp(22px,2.2vw,29px)",fontWeight:800,margin:"8px 0 6px"}}>O que mudou em relação ao período anterior?</h2>
 <p style={{fontSize:13,opacity:.75,marginBottom:18}}>Resultados do período selecionado comparados com os {period} dias imediatamente anteriores.</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
 {rows.map(row=>{const change=row.now!==null&&row.before!==null&&row.before!==undefined&&row.before>0?(row.now-row.before)/row.before*100:null;const favorable=change!==null&&(row.lowerBetter?change<0:change>0);
 return <article key={row.title} className="scase-compare-card" style={{borderRadius:13,padding:17}}>
 <span style={{fontSize:12,opacity:.78}}>{row.title}</span>
 <strong style={{display:"block",fontSize:23,margin:"9px 0 7px"}}>{row.now===null?"—":row.fmt(row.now)}</strong>
 <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:5,fontSize:12}}>
 <span style={{fontWeight:800,color:change===null?"inherit":favorable?"#00a969":"inherit"}}>{change===null?"Sem base comparável":change===0?"Estável":pct(change)}</span>
 <span style={{opacity:.7}}>Anterior: {row.before===null||row.before===undefined?"—":row.fmt(row.before)}</span>
 </div>
 </article>})}
 </div>
 <p style={{fontSize:12,opacity:.68,marginTop:14}}>Os valores refletem a atribuição do Google Ads. Mudanças de volume ou custo não representam, por si só, melhora na qualidade dos contatos.</p>
 </section>;
}