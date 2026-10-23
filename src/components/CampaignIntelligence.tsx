type Conversion={name:string;count:number};
type Device={campaignId:string;device:string;cost:number;clicks:number;conversions:number};
type Term={campaignId:string;term:string;cost:number;conversions:number};
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:2});
const deviceNames:Record<string,string>={MOBILE:"Celular",DESKTOP:"Computador",TABLET:"Tablet",CONNECTED_TV:"TV conectada",OTHER:"Outros"};
export function CampaignIntelligence({conversionActions,devices,searchTerms,selectedCampaign}:{conversionActions:Conversion[];devices:Device[];searchTerms:Term[];selectedCampaign:string}){
 const activeDevices=devices.filter(d=>selectedCampaign==="all"||d.campaignId===selectedCampaign);
 const grouped=new Map<string,{cost:number;conversions:number;clicks:number}>();
 for(const d of activeDevices){const previous=grouped.get(d.device)??{cost:0,conversions:0,clicks:0};previous.cost+=d.cost;previous.clicks+=d.clicks;previous.conversions+=d.conversions;grouped.set(d.device,previous)}
 const topDevices=[...grouped].sort((a,b)=>b[1].conversions-a[1].conversions);
 const terms=searchTerms.filter(t=>selectedCampaign==="all"||t.campaignId===selectedCampaign).sort((a,b)=>b.conversions-a.conversions).slice(0,5);
 return <section className="panel scase-intelligence" style={{padding:"clamp(20px,3vw,32px)",marginTop:18}}>
 <span className="eyebrow">INTELIGÊNCIA DE RESULTADOS</span><h2 style={{fontSize:"clamp(23px,2.4vw,30px)",margin:"8px 0"}}>De onde vieram os resultados?</h2><p style={{fontSize:13,opacity:.75,marginBottom:20}}>Detalhes da campanha para entender melhor as oportunidades geradas no período.</p>
 <div className="scase-intelligence-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(235px,1fr))",gap:14}}>
 <div className="scase-intelligence-tile"><h3>Ações de conversão</h3>{conversionActions.length?conversionActions.map(x=><div className="scase-intelligence-line" key={x.name}><span>{x.name}</span><strong>{num(x.count)}</strong></div>):<p className="scase-intelligence-empty">Sem detalhamento de ações disponível nesta consulta.</p>}</div>
 <div className="scase-intelligence-tile"><h3>Resultados por dispositivo</h3>{topDevices.length?topDevices.map(([name,d])=><div className="scase-intelligence-line" key={name}><span>{deviceNames[name]??name}<small>{num(d.clicks)} cliques</small></span><strong>{num(d.conversions)} conv.<small>{d.conversions?money(d.cost/d.conversions)+"/conv.":"Sem custo/conv."}</small></strong></div>):<p className="scase-intelligence-empty">Detalhamento por dispositivo indisponível para este período.</p>}</div>
 <div className="scase-intelligence-tile"><h3>Pesquisas que converteram</h3>{terms.length?terms.map((x,i)=><div className="scase-intelligence-line" key={i}><span>{x.term}<small>{money(x.cost)} investidos</small></span><strong>{num(x.conversions)} conv.</strong></div>):<p className="scase-intelligence-empty">Sem termos de pesquisa com conversões disponíveis. Outros tipos de campanha podem não oferecer esse dado.</p>}</div>
 </div><p style={{fontSize:11,opacity:.65,marginTop:15}}>Informações disponíveis na API do Google Ads. O detalhamento pode variar conforme a campanha e as regras de privacidade da plataforma.</p></section>;
}