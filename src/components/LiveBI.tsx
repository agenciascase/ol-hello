import {useEffect,useMemo,useState} from "react";
import {Area,AreaChart,Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis,Pie,PieChart,Cell} from "recharts";
type Campaign={id:string;name:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number;phoneCalls?:number;interactions?:number;absoluteTopImpressionPercentage?:number|null};
type Daily={day:string;current:number;impressions:number;clicks:number;conversions:number};
type Totals={cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number};
type Metric="cost"|"impressions"|"clicks"|"conversions"|"ctr"|"cpc"|"cpa"|"cpm"|"convRate"|"absTop"|"phoneCalls";
const labels:Record<Metric,string>={cost:"Investimento",impressions:"Impressões",clicks:"Cliques",conversions:"Conversões",ctr:"CTR",cpc:"CPC",cpa:"Custo por conversão",cpm:"CPM",convRate:"Taxa de conv.",absTop:"Taxa de impr. na 1ª posição",phoneCalls:"Ligações telefônicas"};
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:2});
const delta=(now:number,before:number)=>before===0?(now===0?"Sem variação":"Sem base anterior"):(now-before>=0?"+":"")+num((now-before)/before*100)+"%";
const format=(n:number,m:Metric)=>["cost","cpc","cpa","cpm"].includes(m)?money(n):["ctr","convRate","absTop"].includes(m)?num(n)+"%":num(n);
const metricValue=(c:{cost:number;impressions:number;clicks:number;conversions:number},m:Metric):number=>m==="ctr"?(c.impressions?c.clicks/c.impressions*100:0):m==="cpc"?(c.clicks?c.cost/c.clicks:0):m==="cpa"?(c.conversions?c.cost/c.conversions:0):m==="cpm"?(c.impressions?c.cost/c.impressions*1000:0):m==="convRate"?(("interactions" in c&&Number(c.interactions)>0)?c.conversions/Number(c.interactions)*100:0):m==="phoneCalls"?(("phoneCalls" in c)?Number(c.phoneCalls??0):0):m==="absTop"?(("absoluteTopImpressionPercentage" in c&&typeof c.absoluteTopImpressionPercentage==="number")?c.absoluteTopImpressionPercentage*100:0):c[m as "cost"|"impressions"|"clicks"|"conversions"];
export function LiveBI({campaigns,daily,client,previous,period,periodStart,periodEnd,previousStart,previousEnd,comparePrevious=false,conversionActions=[]}:{campaigns:Campaign[];daily:Daily[];client:string;previous?:Totals;period:string;periodStart?:string;periodEnd?:string;previousStart?:string;previousEnd?:string;comparePrevious?:boolean;conversionActions?:Array<{name:string;count:number}>}){
 const dateLabel=(v?:string)=>v?new Date(v+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"}):"";
 const currentRange=periodStart&&periodEnd?(periodStart===periodEnd?dateLabel(periodStart):dateLabel(periodStart)+" a "+dateLabel(periodEnd)):"últimos "+period+" dias";
 const comparable=(key:Metric)=>selected==="all"&&!!previous&&["cost","impressions","clicks","conversions","ctr","cpc","cpa","cpm"].includes(key);
 const [metric,setMetric]=useState<Metric>("conversions");
 const [platform,setPlatform]=useState<"google"|"meta">("google");
 const [pickerOpen,setPickerOpen]=useState(false);
 const [selected,setSelected]=useState("all");
 const [chosenMetrics,setChosenMetrics]=useState<Metric[]>(()=>{try{const value=JSON.parse(window.localStorage.getItem("scase-bi-metric-order")||"null");if(Array.isArray(value)&&value.every((m:string)=>m in labels))return value;}catch{}return ["cost","impressions","clicks","conversions"];});
 const [draggedBI,setDraggedBI]=useState<Metric|null>(null);
 const [showDaily,setShowDaily]=useState(true);
 const [showComparison,setShowComparison]=useState(true);
 const [showDistribution,setShowDistribution]=useState(true);
 const [showSummary,setShowSummary]=useState(true);
 const [showTable,setShowTable]=useState(true);
 const [sortBy,setSortBy]=useState<Metric>("cost");
 const [preset,setPreset]=useState("custom");
 const [chartOrder,setChartOrder]=useState<string[]>(["daily","comparison","distribution","summary","table"]);
 const [dragChart,setDragChart]=useState<string|null>(null);
 useEffect(()=>{try{const saved=localStorage.getItem("scase-bi-layout-"+client);if(saved){const value=JSON.parse(saved) as {metrics?:Metric[];sections?:string[]};if(value.metrics?.length)setChosenMetrics(value.metrics.filter(m=>m in labels));if(value.sections?.length)setChartOrder(value.sections);}}catch{}},[client]);
 useEffect(()=>{try{localStorage.setItem("scase-bi-layout-"+client,JSON.stringify({metrics:chosenMetrics,sections:chartOrder}));}catch{}},[client,chosenMetrics,chartOrder]);
 const chosen=selected==="all"?campaigns:campaigns.filter(c=>c.id===selected);
 const total=chosen.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions,phoneCalls:a.phoneCalls+(c.phoneCalls??0),interactions:a.interactions+(c.interactions??0),absoluteTopNumerator:a.absoluteTopNumerator+(c.absoluteTopImpressionPercentage??0)*c.impressions,absoluteTopDenominator:a.absoluteTopDenominator+(c.absoluteTopImpressionPercentage==null?0:c.impressions)}),{cost:0,impressions:0,clicks:0,conversions:0,phoneCalls:0,interactions:0,absoluteTopNumerator:0,absoluteTopDenominator:0});
 const compared:[string,Metric][]=chosenMetrics.map(m=>[labels[m],m]);
 const graph=chosen.map(c=>({name:c.name.length>28?c.name.slice(0,27)+"…":c.name,...c,ctr:metricValue(c,"ctr"),cpc:metricValue(c,"cpc"),cpa:metricValue(c,"cpa"),cpm:metricValue(c,"cpm"),convRate:metricValue(c,"convRate"),absTop:metricValue(c,"absTop"),phoneCalls:metricValue(c,"phoneCalls")}));
 const dailyGraph=daily.map(d=>({day:d.day.slice(5),cost:d.current,impressions:d.impressions,clicks:d.clicks,conversions:d.conversions,ctr:d.impressions?d.clicks/d.impressions*100:0,cpc:d.clicks?d.current/d.clicks:0,cpa:d.conversions?d.current/d.conversions:0,cpm:d.impressions?d.current/d.impressions*1000:0,convRate:undefined,absTop:undefined,phoneCalls:undefined}));
 const palette=["#00af65","#008d55","#57d59a"];
 const configure=(kind:"executive"|"performance"|"conversion"|"custom")=>{setPreset(kind);if(kind==="executive")setChosenMetrics(["cost","clicks","conversions","cpa"]);if(kind==="performance")setChosenMetrics(["impressions","clicks","ctr","cpc","cpm"]);if(kind==="conversion")setChosenMetrics(["conversions","convRate","cpa","phoneCalls"]);};
 const reorder=(source:string,target:string)=>{if(source===target)return;setChartOrder(previous=>{const next=[...previous];const from=next.indexOf(source),to=next.indexOf(target);if(from<0||to<0)return previous;next.splice(from,1);next.splice(to,0,source);return next;});};
 const visibleSections:Record<string,boolean>={daily:showDaily,comparison:showComparison,distribution:showDistribution,summary:showSummary,table:showTable};
 const sortedCampaigns=[...chosen].sort((a,b)=>metricValue(b,sortBy)-metricValue(a,sortBy));
 return <div className="biView biPremium">
 <div className="biHeaderRow"><div><span className="eyebrow">SCASE PERFORMANCE / INTELIGÊNCIA EM RESULTADOS</span><h2>O desempenho das suas campanhas</h2><p>{client} · Google Ads · {currentRange} · comparação com período anterior equivalente</p></div></div>
 <section className="panel" style={{padding:20,marginBottom:18}}><div style={{display:"flex",flexWrap:"wrap",alignItems:"end",gap:14}}>
 <label style={{flex:"2 1 250px",fontSize:13}}>Campanha<select value={selected} onChange={e=>setSelected(e.target.value)} style={{width:"100%",display:"block",marginTop:7,padding:10,borderRadius:8,border:"1px solid #dce9e0"}}><option value="all">Todas as campanhas</option>{campaigns.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
 <label style={{flex:"1 1 200px",fontSize:13}}>Plataforma<select value={platform} onChange={e=>{setPlatform(e.target.value as "google"|"meta");setSelected("all");}} style={{width:"100%",display:"block",marginTop:7,padding:10,borderRadius:8,border:"1px solid #dce9e0"}}><option value="google">Google Ads</option><option value="meta" disabled>Meta Ads · ainda não conectado</option></select></label> </div>
 <div style={{marginTop:18,borderTop:"1px solid #e4ece7",paddingTop:14}}><button type="button" className="secondary" onClick={()=>setPickerOpen(v=>!v)} aria-expanded={pickerOpen} style={{display:"inline-flex",alignItems:"center",gap:8}}>Personalizar métricas ({chosenMetrics.length}) {pickerOpen?"▴":"▾"}</button>{pickerOpen&&<div className="metricPicker scase-bi-metrics-picker" style={{position:"relative",marginTop:12,maxWidth:"100%",padding:16,borderRadius:12}}><strong style={{display:"block",marginBottom:10}}>Escolha as métricas e os gráficos do painel</strong><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:10}}>{(Object.keys(labels) as Metric[]).map(m=><label key={m} style={{fontSize:13,display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={chosenMetrics.includes(m)} onChange={e=>{setPreset("custom");setChosenMetrics(v=>e.target.checked?[...v,m]:v.filter(x=>x!==m));}}/>{labels[m]}</label>)}</div><button className="textLink" type="button" onClick={()=>setPickerOpen(false)} style={{marginTop:15}}>Concluir ✓</button></div>}</div></section>
 <div className="scase-bi-executive"><aside className="scase-bi-rail"><div className="scase-bi-rail-heading">PRINCIPAIS INDICADORES</div><div className="biKpiGrid">{compared.map(([name,key])=><article className="panel" key={key} draggable title="Arraste para reorganizar os indicadores" onDragStart={e=>{setDraggedBI(key);e.dataTransfer.setData("text/plain",key);e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData("text/plain") as Metric;if(!source||source===key)return;setChosenMetrics(old=>{const updated=[...old],i=updated.indexOf(source),j=updated.indexOf(key);if(i<0||j<0)return old;updated.splice(i,1);updated.splice(j,0,source);try{window.localStorage.setItem("scase-bi-metric-order",JSON.stringify(updated));}catch{}return updated;});setDraggedBI(null);}} onDragEnd={()=>setDraggedBI(null)} style={{padding:18,borderRadius:16,cursor:"grab",opacity:draggedBI===key?.65:1,position:"relative",overflow:"visible"}}>{key==="conversions"&&conversionActions.length>0&&<div className="scase-conversion-tags" aria-label="Ações de conversão registradas">{conversionActions.map(a=><span key={a.name} className="scase-conversion-tag" title={a.name}>{a.name}</span>)}</div>}<span style={{fontSize:12,opacity:.75}}>{name}</span><strong style={{fontSize:24,display:"block",margin:"8px 0"}}>{format((key==="absTop"?(total.absoluteTopDenominator?100*total.absoluteTopNumerator/total.absoluteTopDenominator:0):metricValue(total,key)),key)}</strong>{comparePrevious&&<span style={{fontWeight:700,color:comparable(key)&&metricValue(total,key)>=metricValue(previous!,key)?"#008c5f":"#b04b3d"}}>{comparable(key)?(()=>{const now=metricValue(total,key),before=metricValue(previous!,key),difference=now-before;const amount=(difference>0?"+":difference<0?"−":"")+format(Math.abs(difference),key)+(key==="ctr"?" pp":"");return amount+" ("+delta(now,before)+")";})():selected!=="all"?"Sem histórico da campanha":"Sem base anterior"}</span>}</article>)}</div>
 </aside><div className="scase-bi-visuals"><div className="scase-bi-visuals-heading"><div><strong>PAINEL DE DESEMPENHO</strong><span>Gráficos das métricas escolhidas · {client} · {currentRange}</span></div></div><div className="scase-bi-chart-grid">
 {chosenMetrics.map(key=>{
  const isDaily=["cost","impressions","clicks","conversions","ctr","cpc","cpa","cpm"].includes(key);
  const useDaily=selected==="all"&&dailyGraph.length>0&&isDaily;
  const chartRows=graph.map(c=>({name:c.name,value:metricValue(c,key)}));
  const noData=useDaily?dailyGraph.every(d=>!Number(d[key as keyof typeof d]??0)):chartRows.every(d=>!Number(d.value));
  const donut=key==="cost"&&selected==="all"&&graph.length>1;
  const distribution=graph.filter(c=>c.cost>0).map(c=>({name:c.name,value:c.cost}));
  return <section key={key} className="panel" style={{padding:20,borderRadius:18,minWidth:0}}>
   <div className="panelHead"><div><h2>{labels[key]}</h2><p>{donut?"Distribuição de investimento entre campanhas":useDaily?"Evolução diária · período selecionado":"Comparação entre campanhas · período selecionado"}</p></div></div>
   {noData?<div style={{minHeight:250,display:"grid",placeItems:"center",textAlign:"center",fontSize:13,opacity:.72}}>Sem dados disponíveis para este indicador no período.</div>:
   <div style={{height:280,marginTop:14}}><ResponsiveContainer width="100%" height="100%">
   {donut?<PieChart><Pie data={distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="46%" outerRadius="72%" paddingAngle={2}>{distribution.map((d,i)=><Cell key={d.name} fill={palette[i%palette.length]}/>)}</Pie><Tooltip formatter={v=>money(Number(v))}/></PieChart>:useDaily?<AreaChart data={dailyGraph} margin={{top:10,right:14,bottom:8,left:2}}>
    <CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="day" tick={{fontSize:11}} minTickGap={24}/><YAxis width={60} tick={{fontSize:11}} tickFormatter={n=>key==="cost"||key==="cpc"||key==="cpa"||key==="cpm"?"R$ "+num(Number(n)):num(Number(n))}/><Tooltip formatter={v=>format(Number(v),key)} /><Area type="monotone" dataKey={key} name={labels[key]} stroke="#00b969" fill="#00b96920" strokeWidth={3} dot={false}/></AreaChart>:
    <BarChart data={chartRows} layout="vertical" margin={{top:10,right:14,bottom:8,left:8}}>
    <CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:11}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:10}}/><Tooltip formatter={v=>format(Number(v),key)}/><Bar dataKey="value" name={labels[key]} fill="#00b969" radius={[0,6,6,0]}/></BarChart>}
   </ResponsiveContainer></div>}
   {selected!=="all"&&isDaily&&<p style={{fontSize:11,marginTop:8,opacity:.7}}>Visão por campanha: total no período. Série diária individual não disponível nesta consulta.</p>}
  </section>;
 })}
 </div></div></div>
 </div>;
}
