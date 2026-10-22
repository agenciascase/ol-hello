import {useMemo,useState} from "react";
import {Area,AreaChart,Bar,BarChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
type Campaign={id:string;name:string;status:string;cost:number;impressions:number;clicks:number;conversions:number;conversionValue:number};
type Daily={day:string;current:number;impressions:number;clicks:number;conversions:number};
type Metric="cost"|"impressions"|"clicks"|"conversions"|"ctr"|"cpc"|"cpa";
const metrics:Record<Metric,{label:string;unit:string}>={cost:{label:"Investimento",unit:"R$"},impressions:{label:"Impressões",unit:""},clicks:{label:"Cliques",unit:""},conversions:{label:"Conversões",unit:""},ctr:{label:"CTR",unit:"%"},cpc:{label:"CPC",unit:"R$"},cpa:{label:"Custo por conversão",unit:"R$"}};
const currency=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmt=(v:number)=>v.toLocaleString("pt-BR",{maximumFractionDigits:2});
const value=(c:Campaign,m:Metric)=>m==="ctr"?(c.impressions?100*c.clicks/c.impressions:0):m==="cpc"?(c.clicks?c.cost/c.clicks:0):m==="cpa"?(c.conversions?c.cost/c.conversions:0):c[m];
const chartStyle={height:290,width:"100%"};
export function LiveBI({campaigns,daily,client}:{campaigns:Campaign[];daily:Daily[];client:string}){
 const [selected,setSelected]=useState("all");
 const [goal,setGoal]=useState<"traffic"|"conversions"|"investment">("traffic");
 const [metric,setMetric]=useState<Metric>("clicks");
 const filtered=useMemo(()=>selected==="all"?campaigns:campaigns.filter(c=>c.id===selected),[campaigns,selected]);
 const names=filtered.map(c=>({...c,short:c.name.length>30?c.name.slice(0,27)+"…":c.name,ctr:value(c,"ctr"),cpc:value(c,"cpc"),cpa:value(c,"cpa")}));
 const total=filtered.reduce((a,c)=>({cost:a.cost+c.cost,impressions:a.impressions+c.impressions,clicks:a.clicks+c.clicks,conversions:a.conversions+c.conversions}),{cost:0,impressions:0,clicks:0,conversions:0});
 const mainMetric:Metric=goal==="traffic"?"clicks":goal==="conversions"?"conversions":"cost";
 const trend=daily.map(d=>({day:d.day.slice(5),cost:d.current,impressions:d.impressions,clicks:d.clicks,conversions:d.conversions}));
 const color="#00b969";
 const panel={padding:20,border:"1px solid #dde9e2",borderRadius:18,background:"#fff"} as const;
 const title={margin:"0 0 5px",fontSize:17,fontWeight:750} as const;
 return <div className="biView biPremium" style={{display:"grid",gap:18}}>
 <div style={panel}><span className="eyebrow">SCASE PERFORMANCE · INTELIGÊNCIA DE CAMPANHAS</span><h2 style={{margin:"8px 0"}}>Análise visual dos resultados</h2><p style={{marginBottom:16}}>Compare campanhas e métricas reais da conta {client}. Gráficos atualizados conforme o período selecionado.</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"end"}}>
 <label style={{flex:"2 1 230px"}}>Campanha<select style={{display:"block",width:"100%",padding:10,marginTop:6}} value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Todas as campanhas</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label style={{flex:"1 1 180px"}}>Objetivo da análise<select style={{display:"block",width:"100%",padding:10,marginTop:6}} value={goal} onChange={e=>{const g=e.target.value as typeof goal;setGoal(g);setMetric(g==="traffic"?"clicks":g==="conversions"?"conversions":"cost")}}><option value="traffic">Tráfego</option><option value="conversions">Conversões</option><option value="investment">Investimento</option></select></label>
 <label style={{flex:"1 1 180px"}}>Métrica dos gráficos<select style={{display:"block",width:"100%",padding:10,marginTop:6}} value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{(Object.keys(metrics) as Metric[]).map(m=><option key={m} value={m}>{metrics[m].label}</option>)}</select></label></div></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
 {([["Investimento",currency(total.cost)],["Cliques",fmt(total.clicks)],["Conversões",fmt(total.conversions)],["CTR",fmt(total.impressions?100*total.clicks/total.impressions:0)+"%"]] as const).map(([name,number])=><div key={name} style={panel}><div style={{fontSize:12,opacity:.7}}>{name}</div><strong style={{fontSize:21}}>{number}</strong></div>)}</div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:16}}>
 <section style={panel}><h3 style={title}>Evolução diária · {metrics[mainMetric].label}</h3><p style={{fontSize:12,opacity:.7}}>Todos os resultados da conta; selecione o período no filtro superior</p><div style={chartStyle}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis width={54}/><Tooltip formatter={v=>mainMetric==="cost"?currency(Number(v)):fmt(Number(v))}/><Area dataKey={mainMetric} name={metrics[mainMetric].label} type="monotone" stroke={color} fill="#dcf9e9" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></section>
 <section style={panel}><h3 style={title}>Comparativo por campanha</h3><p style={{fontSize:12,opacity:.7}}>{metrics[metric].label} · resultados apurados no Google Ads</p><div style={chartStyle}><ResponsiveContainer width="100%" height="100%"><BarChart data={names} layout="vertical" margin={{left:5,right:18}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number"/><YAxis dataKey="short" type="category" width={110} tick={{fontSize:10}}/><Tooltip formatter={v=>metrics[metric].unit==="R$"?currency(Number(v)):fmt(Number(v))+(metrics[metric].unit==="% "?"%":"")}/><Bar dataKey={metric} name={metrics[metric].label} fill={color} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div></section>
 <section style={panel}><h3 style={title}>Distribuição do investimento</h3><p style={{fontSize:12,opacity:.7}}>Quanto cada campanha representa do valor investido</p><div style={chartStyle}><ResponsiveContainer width="100%" height="100%"><BarChart data={names}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="short" tick={{fontSize:10}} interval={0} angle={-20} height={75}/><YAxis width={55}/><Tooltip formatter={v=>currency(Number(v))}/><Bar dataKey="cost" name="Investimento" fill="#046b48" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></section>
 <section style={panel}><h3 style={title}>Eficiência por campanha</h3><p style={{fontSize:12,opacity:.7}}>CTR e taxa de conversão entre cliques (indicadores distintos)</p><div style={chartStyle}><ResponsiveContainer width="100%" height="100%"><BarChart data={names.map(c=>({...c,conversionRate:c.clicks?100*c.conversions/c.clicks:0}))}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="short" tick={{fontSize:10}} interval={0} angle={-20} height={75}/><YAxis width={45} unit="%"/><Tooltip formatter={v=>fmt(Number(v))+"%"}/><Legend/><Bar dataKey="ctr" name="CTR" fill={color} radius={[5,5,0,0]}/><Bar dataKey="conversionRate" name="Conversões / cliques" fill="#0c6247" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>
 </div>
 <p style={{fontSize:12,opacity:.7}}>Nota: as conversões podem incluir diferentes ações configuradas no Google Ads. O gráfico de evolução utiliza dados diários consolidados da conta. Para analisar uma campanha específica, use o seletor acima; métricas sem volume são exibidas como zero, não como estimativas.</p>
 </div>;
}
