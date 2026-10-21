import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, BarChart3, Bell, BrainCircuit, ChevronDown, CreditCard, LayoutDashboard, LogOut, Megaphone, Search, Settings, ShieldCheck, Users, Wallet, X, Sun, Moon, SlidersHorizontal, Check, TrendingUp, AlertTriangle, Lightbulb, Image as ImageIcon, ImageOff, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "../../performance.css";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — SCASE Performance" },
      { name: "description", content: "Acompanhe a performance das campanhas de Google Ads e Meta Ads" },
      { property: "og:title", content: "Painel — SCASE Performance" },
      { property: "og:description", content: "Acompanhe a performance das campanhas de Google Ads e Meta Ads" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Performance,
});

type View = "dashboard" | "campaigns" | "clients" | "settings";
type Network = "all" | "google" | "meta";
type Duration = "7" | "30" | "today";
type Objective = "all" | "reach" | "leads" | "sales" | "traffic";

const customers = [
  {name:"Casa de Ração Santo Expedito",tag:"Varejo pet",short:"SE",channels:"Google + Meta",color:"#dfedff"},
  {name:"Hotel Caxambu",tag:"Hotelaria",short:"HC",channels:"Google + Meta",color:"#fff0db"},
  {name:"Siga Brasil Transportes",tag:"Logística",short:"SB",channels:"Google",color:"#dcf7ef"},
  {name:"Aeronorte",tag:"Transporte especializado",short:"AN",channels:"Google + Meta",color:"#eee6ff"},
];
const baseCampaigns = [
  {name:"Conversões | WhatsApp | Pet",network:"meta",cost:1850,views:98410,clicks:3140,conversions:148,leads:148,revenue:9050,status:"Ativa"},
  {name:"Pesquisa | Ração e Pet Shop",network:"google",cost:2320,views:64200,clicks:2841,conversions:132,leads:112,revenue:12200,status:"Ativa"},
  {name:"Remarketing | Ofertas do mês",network:"meta",cost:980,views:45120,clicks:1198,conversions:62,leads:60,revenue:4250,status:"Ativa"},
  {name:"Performance Max | Produtos",network:"google",cost:1210,views:79210,clicks:1980,conversions:76,leads:66,revenue:8410,status:"Em análise"},
  {name:"Alcance | Região",network:"meta",cost:640,views:120500,clicks:890,conversions:16,leads:14,revenue:1240,status:"Ativa"}
] as const;
const objectiveLabels: Record<Exclude<Objective, "all">, string> = {reach:"Alcance",leads:"Formulários e leads",sales:"Vendas e conversões",traffic:"Tráfego"};
function classifyCampaign(name:string):Exclude<Objective,"all"> {
 const s=name.toLowerCase();
 if (/alcance|reconhecimento|awareness|impress/.test(s)) return "reach";
 if (/formul|cadastro|lead|whatsapp/.test(s)) return "leads";
 if (/pesquisa|tráfego|trafego|clique|visitas/.test(s)) return "traffic";
 return "sales";
}
function campaignMetrics(c:typeof baseCampaigns[number],factor:number){
 const cost=c.cost*factor,impressions=c.views*factor,clicks=c.clicks*factor,leads=c.leads*factor,conversions=c.conversions*factor,revenue=c.revenue*factor;
 const obj=classifyCampaign(c.name);
 const reach=Math.round(impressions*.78),frequency=reach?impressions/reach:0;
 const money=(v:number)=>cash(v),num=(v:number)=>int(v),percent=(v:number)=>pct(v);
 const metrics={
 reach:[{label:"Alcance",value:num(reach),hint:"Pessoas alcançadas (estimativa demo)"},{label:"Impressões",value:num(impressions),hint:"Exibições do anúncio"},{label:"Frequência",value:frequency.toFixed(2).replace(".",",")+"x",hint:"Impressões por pessoa"},{label:"CPM",value:money(impressions?cost/impressions*1000:0),hint:"Custo a cada mil impressões"}],
 leads:[{label:"Leads",value:num(leads),hint:"Cadastros e contatos"},{label:"Custo por lead",value:money(leads?cost/leads:0),hint:"Investimento por lead"},{label:"Conversões",value:num(conversions),hint:"Eventos atribuídos"},{label:"Taxa de conversão",value:percent(clicks?leads/clicks*100:0),hint:"Leads em relação aos cliques"}],
 sales:[{label:"Conversões",value:num(conversions),hint:"Resultados atribuídos"},{label:"Custo por conversão",value:money(conversions?cost/conversions:0),hint:"Investimento por resultado"},{label:"Receita atribuída",value:money(revenue),hint:"Receita ilustrativa"},{label:"ROAS",value:(cost?revenue/cost:0).toFixed(2).replace(".",",")+"x",hint:"Receita por real investido"}],
 traffic:[{label:"Cliques",value:num(clicks),hint:"Interações com o anúncio"},{label:"CTR",value:percent(impressions?clicks/impressions*100:0),hint:"Taxa de cliques"},{label:"CPC",value:money(clicks?cost/clicks:0),hint:"Custo médio por clique"},{label:"Impressões",value:num(impressions),hint:"Exibições do anúncio"}]
 };
 return {obj,items:metrics[obj],cost};
}
const history = [
  {type:"Diária",date:"19/10/2026",title:"Mais leads com menor custo",text:"O volume de leads evoluiu em relação ao dia anterior. A campanha de pesquisa se destacou na eficiência."},
  {type:"Semanal",date:"19/10/2026",title:"Evolução dos últimos 7 dias",text:"Campanhas de conversão ganharam eficiência. Recomenda-se acompanhar o CPC do remarketing."},
  {type:"Quinzenal",date:"16/10/2026",title:"Panorama quinzenal",text:"Crescimento consistente das conversões com oportunidades de otimização nas campanhas de alcance."},
  {type:"Mensal",date:"01/10/2026",title:"Fechamento de setembro",text:"Análise consolidada dos principais indicadores, campanhas de destaque e próximos passos."}
];
const cash=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const int=(n:number)=>Math.round(n).toLocaleString("pt-BR");
const pct=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";

function useMyAccount() {
  return useQuery({
    queryKey: ["my-account"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, name: "", email: "", company: "" };
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, company").eq("id", user.id).maybeSingle(),
      ]);
      return {
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        name: profile?.full_name ?? "",
        email: user.email ?? "",
        company: profile?.company ?? "",
      };
    },
  });
}

function Performance(){
 const { data: account, isLoading } = useMyAccount();
 const navigate = useNavigate();
 const queryClient = useQueryClient();
 const [viewAsClient,setViewAsClient]=useState(false);
 const [view,setView]=useState<View>("dashboard");
 const [client,setClient]=useState(0);
 const [network,setNetwork]=useState<Network>("all");
 const [duration,setDuration]=useState<Duration>("30");
 const [reportFilter,setReportFilter]=useState("Todas");
 const [search,setSearch]=useState("");
 const [objective,setObjective]=useState<Objective>("all");
 const [selectedCampaign,setSelectedCampaign]=useState<string|null>(null);
 const [mobile,setMobile]=useState(false);
 const [alerts,setAlerts]=useState(true);
 const [theme,setTheme]=useState<"light"|"dark">("light");
 const [metricPicker,setMetricPicker]=useState(false);
 const [dashboardMode,setDashboardMode]=useState<"classic"|"bi">("classic");
 const [biCampaign,setBiCampaign]=useState("all");
 const [biMetric,setBiMetric]=useState<"cost"|"views"|"clicks"|"leads"|"conversions"|"revenue">("leads");
 const [visibleMetrics,setVisibleMetrics]=useState<string[]>(["Investimento","Impressões","Cliques","CTR","CPC","CPM","Conversões","Custo por conversão","Leads","Custo por lead"]);
 const filtered=useMemo(()=>baseCampaigns.filter(c=>network==="all"||c.network===network).filter(c=>c.name.toLowerCase().includes(search.toLowerCase())).filter(c=>objective==="all"||classifyCampaign(c.name)===objective),[network,search,objective]);
 const multiplier=duration==="today"?1/30:duration==="7"?7/30:1;
 const biRows=useMemo(()=>biCampaign==="all"?filtered:filtered.filter(c=>c.name===biCampaign),[filtered,biCampaign]);
 const totals=useMemo(()=>filtered.reduce((a,c)=>({cost:a.cost+c.cost*multiplier,views:a.views+c.views*multiplier,clicks:a.clicks+c.clicks*multiplier,conversions:a.conversions+c.conversions*multiplier,leads:a.leads+c.leads*multiplier,revenue:a.revenue+c.revenue*multiplier}),{cost:0,views:0,clicks:0,conversions:0,leads:0,revenue:0}),[filtered,multiplier]);
 const chart=useMemo(()=>Array.from({length:duration==="today"?8:duration==="7"?7:15},(_,i)=>({day:duration==="today"?String(i*3).padStart(2,"0")+"h":String(i+1).padStart(2,"0"),current:Math.round(totals.cost/(duration==="today"?8:duration==="7"?7:15)*(0.7+((i*7)%9)/12)),previous:Math.round(totals.cost/(duration==="today"?8:duration==="7"?7:15)*(0.65+((i*3)%8)/13))})),[duration,totals.cost]);
 const kpis=[
  {label:"Investimento",value:cash(totals.cost),delta:"+8,2%"},
  {label:"Impressões",value:int(totals.views),delta:"+12,4%"},
  {label:"Cliques",value:int(totals.clicks),delta:"+9,1%"},
  {label:"CTR",value:pct(totals.views?totals.clicks/totals.views*100:0),delta:"+0,3 p.p."},
  {label:"CPC",value:cash(totals.clicks?totals.cost/totals.clicks:0),delta:"-4,2%"},
  {label:"CPM",value:cash(totals.views?totals.cost/totals.views*1000:0),delta:"-2,8%"},
  {label:"Conversões",value:int(totals.conversions),delta:"+14,6%"},
  {label:"Custo por conversão",value:cash(totals.conversions?totals.cost/totals.conversions:0),delta:"-5,3%"},
  {label:"Receita atribuída",value:cash(totals.revenue),delta:"+18,4%"},
  {label:"ROAS",value:(totals.cost?totals.revenue/totals.cost:0).toFixed(2).replace(".",",")+"x",delta:"+7,2%"},
  {label:"Leads",value:int(totals.leads),delta:"+11,2%"},
  {label:"Custo por lead",value:cash(totals.leads?totals.cost/totals.leads:0),delta:"-3,7%"}
 ];
 const menu:[View,string,React.ReactNode][]=[["dashboard","Visão geral",<LayoutDashboard size={18}/>],["campaigns","Campanhas",<Megaphone size={18}/>],["clients","Clientes",<Users size={18}/>],["settings","Configurações",<Settings size={18}/>]];
 function selectPage(p:View){setView(p);setMobile(false)}
 async function handleSignOut(){
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
  navigate({ to: "/auth", search: { redirect: undefined, mode: undefined }, replace: true });
 }
 if(isLoading||!account)return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">Carregando sua conta…</p></div>;
 const isAdmin=account.isAdmin&&!viewAsClient;
 const displayName=account.name||account.email;
 const initials=(account.name||account.email||"SC").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
 return <div className={"perf appShell "+(theme==="dark"?"themeDark":"themeLight")}>
  {mobile&&<div className="mobileShade" onClick={()=>setMobile(false)} />}
  <aside className={"side "+(mobile?"sideOpen":"")}><div className="sideBrand"><Brand/><button className="iconButton mobileOnly" onClick={()=>setMobile(false)}><X size={18}/></button></div><div className="agencyTag"><span className="signal"/> {isAdmin?"ESPAÇO DA AGÊNCIA":"PORTAL DO CLIENTE"}</div><div className="navLabel">MENU PRINCIPAL</div><nav>{menu.filter(([p])=>isAdmin||!["clients","settings"].includes(p)).map(([p,label,icon])=><button key={p} className={"navItem "+(view===p?"navActive":"")} onClick={()=>selectPage(p)}>{icon}<span>{label}</span></button>)}</nav><div className="sideBottom"><button className="userBox" onClick={handleSignOut} title="Sair da conta"><span className="userAvatar">{initials}</span><span className="userDesc"><strong>{displayName}</strong><small>{isAdmin?"Agência · Administrador":account.company||"Cliente"}</small></span><LogOut size={17}/></button></div></aside>
  <div className="body"><header className="topbar"><button className="iconButton mobileOnly" onClick={()=>setMobile(true)}><span>☰</span></button><div className="breadcrumb">SCASE Performance <span>/</span> {menu.find(([v])=>v===view)?.[1]}</div><div className="topRight"><button className="themeToggle" type="button" onClick={()=>setTheme(theme==="dark"?"light":"dark")} aria-label={theme==="dark"?"Ativar tema claro":"Ativar tema escuro"}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}<span>{theme==="dark"?"Claro":"Escuro"}</span></button><span className="demoChip"><span className="signal"/> Dados de demonstração</span><button className="iconButton" title="Notificações demonstrativas"><Bell size={19}/></button><span className="miniAvatar">{initials}</span></div></header>
  <main className="main"><div className="heading"><div><span className="eyebrow">CENTRAL DE RESULTADOS</span><h1>{view==="dashboard"?"Visão geral":view==="campaigns"?"Campanhas":view==="clients"?"Gestão de clientes":"Configurações"}</h1><p>{view==="dashboard"?"Acompanhe a performance e descubra onde estão as oportunidades.":view==="campaigns"?"Desempenho detalhado das campanhas de mídia paga.":view==="clients"?"Visão centralizada das contas atendidas pela agência.":"Preferências de monitoramento e notificações."}</p></div><div className="headingActions">{account.isAdmin&&!viewAsClient&&<button className="secondary" onClick={()=>{setViewAsClient(true);setView("dashboard")}}>Ver como cliente <ArrowUpRight size={16}/></button>}{account.isAdmin&&viewAsClient&&<button className="secondary" onClick={()=>{setViewAsClient(false);setView("dashboard")}}>Voltar à agência</button>}</div></div>
  {view!=="settings"&&<div className="filters"><div className="filterLeft"><div className="selectWrap"><span>Cliente</span><select disabled={!isAdmin} value={client} onChange={e=>setClient(Number(e.target.value))}>{customers.map((c,i)=><option key={c.name} value={i}>{c.name}</option>)}</select><ChevronDown size={15}/></div><div className="selectWrap"><span>Plataforma</span><select value={network} onChange={e=>setNetwork(e.target.value as Network)}><option value="all">Google + Meta</option><option value="google">Google Ads</option><option value="meta">Meta Ads</option></select><ChevronDown size={15}/></div></div><div className="periods">{(["today","7","30"] as const).map(p=><button key={p} onClick={()=>setDuration(p)} className={duration===p?"chosen":""}>{p==="today"?"Hoje":p==="7"?"7 dias":"30 dias"}</button>)}</div></div>}
  {view==="dashboard"&&<div className="dashboardModeBar"><div><strong>Como deseja acompanhar os resultados?</strong><span>Alterne entre indicadores essenciais e exploração visual</span></div><div className="dashboardModeSwitch" role="group" aria-label="Modo de visualização"><button type="button" aria-pressed={dashboardMode==="classic"} className={dashboardMode==="classic"?"active":""} onClick={()=>setDashboardMode("classic")}><LayoutDashboard size={16}/> Visão atual</button><button type="button" aria-pressed={dashboardMode==="bi"} className={dashboardMode==="bi"?"active":""} onClick={()=>setDashboardMode("bi")}><BarChart3 size={16}/> Modo BI</button></div></div>}
  {view==="dashboard"&&dashboardMode==="bi"&&<BIView rows={biRows} allRows={filtered} selected={biCampaign} onSelect={setBiCampaign} duration={duration} multiplier={multiplier} metric={biMetric} onMetricChange={setBiMetric} kpis={kpis} chart={chart}/>}
  {view==="dashboard"&&dashboardMode==="classic"&&<><div className="dashboardIntro"><span className="eyebrow">PANORAMA EXECUTIVO · DEMONSTRAÇÃO</span><strong>Resultados de mídia em um só lugar</strong><p>Escolha a campanha para analisar as métricas específicas do seu objetivo.</p><button className="primary" type="button" onClick={()=>setView("campaigns")}>Analisar campanhas <ArrowUpRight size={15}/></button></div><div className="sectionTitle"><h2>Indicadores de performance</h2><div className="metricPickerWrap"><button className="secondary" onClick={()=>setMetricPicker(!metricPicker)} type="button"><SlidersHorizontal size={16}/> Personalizar métricas ({visibleMetrics.length})</button>{metricPicker&&<div className="metricPicker"><strong>Escolha seus indicadores</strong>{kpis.map(k=><label key={k.label}><input type="checkbox" checked={visibleMetrics.includes(k.label)} onChange={()=>setVisibleMetrics(v=>v.includes(k.label)?v.filter(x=>x!==k.label):[...v,k.label])}/>{k.label}</label>)}<button className="textLink" type="button" onClick={()=>setMetricPicker(false)}>Concluir <Check size={15}/></button></div>}</div></div><div className="kpiGrid">{kpis.filter(k=>visibleMetrics.includes(k.label)).map((k,i)=><div className="kpi" key={k.label}><div className="kpiTop"><span>{k.label}</span><span className="kpiSymbol">{i===0?<Wallet size={17}/>:i===6?<Activity size={17}/>:<BarChart3 size={17}/>}</span></div><strong>{k.value}</strong><div className="kpiBottom"><span className="growth"><ArrowUpRight size={13}/>{k.delta}</span><span>vs. período anterior*</span></div></div>)}</div><div className="mainGrid"><section className="panel chartPanel"><div className="panelHead"><div><h2>Evolução do investimento</h2><p>Distribuição diária do período selecionado</p></div><span className="pill">● Atual　 ◯ Anterior</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="perfArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.23}/><stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5"/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{fill:"#98a1b0",fontSize:11}}/><Tooltip formatter={(v)=>cash(Number(v))}/><Area type="monotone" dataKey="previous" stroke="#b8c1d0" fill="none" strokeDasharray="5 4" strokeWidth={2}/><Area type="monotone" dataKey="current" stroke="var(--brand-accent)" fill="url(#perfArea)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></section><CampaignFeedback rows={filtered} multiplier={multiplier} duration={duration}/></div></>}
  {view==="campaigns"&&<>
   <section className="objectiveOverview panel">
     <div><span className="eyebrow">RESULTADO CERTO PARA CADA OBJETIVO</span><h2>Explore o desempenho por objetivo</h2><p>Escolha uma campanha para visualizar apenas as métricas que ajudam a avaliar o resultado esperado.</p></div>
     <div className="objectivePills">{([{key:"all",label:"Todos"},{key:"reach",label:"Alcance"},{key:"leads",label:"Formulários e leads"},{key:"sales",label:"Vendas"},{key:"traffic",label:"Tráfego"}] as const).map(o=><button key={o.key} type="button" aria-pressed={objective===o.key} className={objective===o.key?"active":""} onClick={()=>{setObjective(o.key);setSelectedCampaign(null)}}>{o.label}</button>)}</div>
   </section>
   <section className="panel campaignExplorer"><div className="panelHead"><div><h2>Campanhas disponíveis</h2><p>Selecione uma campanha para abrir a visão detalhada • valores demonstrativos</p></div><div className="searchBox"><Search size={16}/><input aria-label="Buscar campanha" placeholder="Buscar campanha" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
    <div className="campaignTiles">{filtered.map(c=>{const m=campaignMetrics(c,multiplier);return <button key={c.name} type="button" className={"campaignTile "+(selectedCampaign===c.name?"selected":"")} onClick={()=>setSelectedCampaign(c.name)} aria-pressed={selectedCampaign===c.name}><span className="tileTop"><span className={"network "+c.network}>{c.network==="google"?"Google Ads":"Meta Ads"}</span><span className="pill">{objectiveLabels[m.obj]}</span></span><strong>{c.name}</strong><span className="tileNumbers"><span><small>Investimento</small><b>{cash(m.cost)}</b></span><span><small>{m.items[0]?.label ?? "Resultado"}</small><b>{m.items[0]?.value ?? "—"}</b></span></span><span className="tileAction">Ver detalhes <ArrowUpRight size={15}/></span></button>})}</div>
    {filtered.length===0&&<p className="emptyCampaigns">Nenhuma campanha demonstrativa encontrada para esse filtro.</p>}
   </section>
   {selectedCampaign&&filtered.some(c=>c.name===selectedCampaign)&&<CampaignDetail campaign={filtered.find(c=>c.name===selectedCampaign)!} multiplier={multiplier} duration={duration}/>}
   <section className="panel tablePanel"><div className="panelHead"><div><h2>Comparativo de campanhas</h2><p>Colunas por objetivo, sem misturar métricas de metas diferentes</p></div></div><CampaignTable rows={filtered} multiplier={multiplier}/></section>
  </>}
  {view==="dashboard"&&dashboardMode==="classic"&&<section className="panel tablePanel"><div className="panelHead"><div><h2>Campanhas em destaque</h2><p>Visão consolidada do desempenho</p></div><button className="textLink" onClick={()=>setView("campaigns")}>Ver todas <ArrowUpRight size={16}/></button></div><CampaignTable rows={filtered.slice(0,4)} multiplier={multiplier}/></section>}
  {view==="clients"&&<div className="clientsGrid">{customers.map((c,i)=><article className="panel clientCard" key={c.name}><div className="clientAvatar" style={{background:c.color}}>{c.short}</div><div><h2>{c.name}</h2><p>{c.tag}</p></div><span className="pill">{c.channels}</span><div className="clientFooter"><span><ShieldCheck size={15}/> Conta demonstrativa</span><button className="textLink" onClick={()=>{setClient(i);setView("dashboard")}}>Ver painel <ArrowUpRight size={15}/></button></div></article>)}</div>}
  {view==="settings"&&<div className="settingsGrid"><section className="panel settingsCard"><h2><Bell size={19}/> Alertas de saldo</h2><p>Monitore a disponibilidade de crédito das contas vinculadas.</p><label className="switchRow"><span>Alertas de saldo baixo <small>Configuração visual, sem verificações automáticas</small></span><input type="checkbox" checked={alerts} onChange={e=>setAlerts(e.target.checked)}/></label><div className="settingLine"><span>Limite sugerido</span><strong>Menos de 2 dias de cobertura</strong></div><div className="settingLine"><span>Frequência planejada</span><strong>A cada hora</strong></div></section><section className="panel settingsCard"><h2><BrainCircuit size={19}/> Rotinas de análises</h2><p>Agendamentos planejados para cada cliente.</p>{["Diária","Semanal","Quinzenal","Mensal"].map(s=><div className="settingLine" key={s}><span>{s}</span><span className="pill">Aguardando integração</span></div>)}</section><section className="panel settingsCard"><h2><CreditCard size={19}/> Integrações</h2><p>Conecte as plataformas na próxima etapa do projeto.</p>{["Google Ads","Meta Ads","WhatsApp"].map(s=><div className="settingLine" key={s}><span>{s}</span><span className="pill">Não conectado</span></div>)}</section></div>}
  <footer className="foot">SCASE Performance · Protótipo visual · *Variações e resultados são exclusivamente ilustrativos. Nenhum dado real está conectado.</footer>
  </main></div></div>;
}

type BIMetric="cost"|"views"|"clicks"|"leads"|"conversions"|"revenue";
const biLabels:Record<BIMetric,string>={cost:"Investimento",views:"Impressões",clicks:"Cliques",leads:"Leads",conversions:"Conversões",revenue:"Receita atribuída"};
function BIView({rows,allRows,selected,onSelect,duration,multiplier,metric,onMetricChange,kpis,chart}:{rows:ReadonlyArray<(typeof baseCampaigns)[number]>;allRows:ReadonlyArray<(typeof baseCampaigns)[number]>;selected:string;onSelect:(v:string)=>void;duration:Duration;multiplier:number;metric:BIMetric;onMetricChange:(value:BIMetric)=>void;kpis:{label:string;value:string;delta:string}[];chart:{day:string;current:number;previous:number}[]}){
 const bars=rows.map(c=>({name:c.name.length>26?c.name.slice(0,25)+"…":c.name,value:Math.round(c[metric]*multiplier)}));
 const summary=rows.reduce((a,c)=>({cost:a.cost+c.cost*multiplier,clicks:a.clicks+c.clicks*multiplier,leads:a.leads+c.leads*multiplier,conversions:a.conversions+c.conversions*multiplier,revenue:a.revenue+c.revenue*multiplier}),{cost:0,clicks:0,leads:0,conversions:0,revenue:0});
 const dashboardKpis=[
 {label:"Investimento",value:cash(summary.cost)},
 {label:"Cliques",value:int(summary.clicks)},
 {label:"Leads",value:int(summary.leads)},
 {label:"CPL",value:cash(summary.leads?summary.cost/summary.leads:0)},
 {label:"Conversões",value:int(summary.conversions)},
 {label:"ROAS",value:(summary.cost?summary.revenue/summary.cost:0).toFixed(2).replace(".",",")+"x"}];
 const downloadPdf=()=>window.print();
 const isMoney=metric==="cost"||metric==="revenue";
 const total=bars.reduce((a,b)=>a+b.value,0);
 const ranked=[...rows].sort((a,b)=>b[metric]-a[metric]);
 return <div className="biView">
  <section className="biHero"><div><span className="eyebrow">CENTRAL BI · DEMONSTRAÇÃO</span><h2>Resultados em perspectiva.</h2><p>Compare objetivos, visualize tendências e acompanhe cada campanha com mais profundidade.</p></div><div className="biAvailability"><span className="biStatusDot"/> Painel disponível 24 horas <small>Dados ilustrativos. Atualização automática real depende das APIs do Google Ads e Meta Ads.</small></div></section>
  <section className="biToolbar"><label>Campanha <select value={selected} onChange={e=>onSelect(e.target.value)}><option value="all">Todas as campanhas</option>{allRows.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label><button type="button" onClick={downloadPdf} className="biExport"><Printer size={17}/> Baixar relatório em PDF</button></section>
  <section className="biPrintHeading"><img src="/scase-logo.svg" alt="SCASE"/><div><h1>Relatório de desempenho</h1><p>{selected==="all"?"Todas as campanhas":selected} • {duration==="today"?"Hoje":duration==="7"?"7 dias":"30 dias"} • Dados demonstrativos</p></div></section>
  <div className="biTopKpis">{dashboardKpis.map(k=><div className="biKpi" key={k.label}><span>{k.label}</span><strong>{k.value}</strong><small>Dados de demonstração</small></div>)}</div>
  <section className="panel biChartPanel"><div className="panelHead"><div><h2>Comparação de campanhas</h2><p>Escolha uma métrica para comparar os resultados no período selecionado</p></div><label className="biSelectLabel">Métrica <select value={metric} onChange={e=>onMetricChange(e.target.value as BIMetric)}>{(Object.keys(biLabels) as BIMetric[]).map(k=><option value={k} key={k}>{biLabels[k]}</option>)}</select></label></div>
  <div className="biChart"><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} layout="vertical" margin={{top:10,right:18,bottom:12,left:4}}><CartesianGrid stroke="#dbe9df" horizontal={false}/><XAxis type="number" tickFormatter={v=>int(Number(v))}/><YAxis type="category" dataKey="name" width={160} tick={{fontSize:11}}/><Tooltip formatter={v=>isMoney?cash(Number(v)):int(Number(v))}/><Bar dataKey="value" name={biLabels[metric]} fill="#00bd69" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div><div className="biChartFoot"><span>Total: <b>{isMoney?cash(total):int(total)}</b></span><span>{rows.length} campanhas</span></div></section>
  <div className="biBottomGrid"><section className="panel biTrendPanel"><div className="panelHead"><div><h2>Evolução do investimento</h2><p>Comparação ilustrativa: {duration==="today"?"hoje":duration==="7"?"7 dias":"30 dias"}</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid stroke="#dbe9df" vertical={false}/><XAxis dataKey="day"/><Tooltip formatter={v=>cash(Number(v))}/><Area dataKey="previous" name="Anterior" stroke="#9bb5a6" strokeDasharray="4 5" fill="none"/><Area dataKey="current" name="Atual" stroke="#00bd69" strokeWidth={3} fill="#00bd691f"/></AreaChart></ResponsiveContainer></div></section>
  <section className="panel biHighlights"><h2>Leitura executiva</h2><p><strong>Indicador em análise:</strong> {biLabels[metric]}</p><p><strong>Maior resultado:</strong> {ranked[0]?.name??"Nenhuma campanha"}</p><p><strong>Período:</strong> {duration==="today"?"Hoje":duration==="7"?"Últimos 7 dias":"Últimos 30 dias"}</p><div className="biDisclaimer">A plataforma poderá ser consultada a qualquer hora. Atualização em tempo real e métricas reais ainda precisam da conexão segura com as APIs.</div></section></div>
  <section className="panel biFullTable"><div className="panelHead"><div><h2>Detalhes por campanha</h2><p>Objetivo, resultado e eficiência em um só comparativo</p></div></div><CampaignTable rows={rows} multiplier={multiplier}/></section>
 </div>;
}

function CampaignFeedback({rows,multiplier,duration}:{rows:ReadonlyArray<(typeof baseCampaigns)[number]>;multiplier:number;duration:Duration}){
 const spend=rows.reduce((a,c)=>a+c.cost*multiplier,0);
 const leads=rows.reduce((a,c)=>a+c.leads*multiplier,0);
 const clicks=rows.reduce((a,c)=>a+c.clicks*multiplier,0);
 const impressions=rows.reduce((a,c)=>a+c.views*multiplier,0);
 const cpl=leads?spend/leads:0;
 const best=rows.filter(c=>classifyCampaign(c.name)==="leads").sort((a,b)=>(a.cost/a.leads)-(b.cost/b.leads))[0];
 return <section className="panel feedbackPanel"><div className="panelHead"><div><span className="eyebrow">LEITURA ESTRATÉGICA</span><h2>Feedback das campanhas</h2><p>Período: {duration==="today"?"Hoje":duration==="7"?"7 dias":"30 dias"} • Análise ilustrativa baseada nos dados exibidos</p></div><span className="pill">DEMONSTRAÇÃO</span></div><div className="feedbackItems">
 <div><TrendingUp size={19}/><strong>Panorama do período</strong><p>{rows.length} campanhas analisadas, {cash(spend)} investidos e {int(leads)} leads demonstrativos.</p></div>
 <div><Check size={19}/><strong>Ponto positivo</strong><p>{best?("A campanha "+best.name+" apresenta o menor CPL entre as campanhas classificadas para leads."):"Acompanhe a evolução dos resultados de acordo com o objetivo de cada campanha."}</p></div>
 <div><AlertTriangle size={19}/><strong>Ponto de atenção</strong><p>{leads?"CPL agregado de "+cash(cpl)+". Compare custos apenas entre campanhas com objetivos semelhantes.":"Sem leads no recorte. Verifique se o objetivo das campanhas prevê geração de contatos."}</p></div>
 <div><Lightbulb size={19}/><strong>Próxima ação</strong><p>{impressions&&clicks/impressions<.015?"Revise criativos e segmentação das campanhas de tráfego com CTR baixo.":"Compare frequência, CTR e custo por resultado individualmente antes de ajustar os investimentos."}</p></div>
 </div><small>Este feedback usa dados de exemplo e regras simples; não é uma análise por IA nem uma recomendação baseada em dados reais.</small></section>;
}
function CampaignDetail({campaign,multiplier,duration}:{campaign:typeof baseCampaigns[number],multiplier:number,duration:Duration}){
 const {obj,items,cost}=campaignMetrics(campaign,multiplier);
 const count=duration==="today"?8:duration==="7"?7:15;
 const series=Array.from({length:count},(_,i)=>{
   const shape=.7+((i*7)%11)/13;
   const activity=obj==="reach"?campaign.views:obj==="leads"?campaign.leads:obj==="sales"?campaign.conversions:campaign.clicks;
   return {day:duration==="today"?String(i*3).padStart(2,"0")+"h":String(i+1).padStart(2,"0"),results:Math.round(activity*multiplier/count*shape)};
 });
 return <section className="panel campaignDetail" aria-label={"Detalhamento de "+campaign.name}><div className="panelHead"><div><span className="eyebrow">{objectiveLabels[obj].toUpperCase()}</span><h2>{campaign.name}</h2><p>Dados ilustrativos • indicadores específicos do objetivo escolhido</p></div><span className="pill">Investimento: {cash(cost)}</span></div>
 <div className="objectiveKpis">{items.map((m,i)=><div className="objectiveKpi" key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.hint}</small>{i===0&&<span className="objectiveTag">Indicador principal</span>}</div>)}</div>
 <div className="objectiveChart"><div className="panelHead"><div><h2>Evolução de {obj==="reach"?"impressões":obj==="leads"?"leads":obj==="sales"?"conversões":"cliques"}</h2><p>Tendência simulada para o período escolhido, não representa dados reais</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><defs><linearGradient id="campaignObjectiveArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#00c96d" stopOpacity={.24}/><stop offset="100%" stopColor="#00c96d" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf2f1"/><XAxis dataKey="day" tickLine={false} axisLine={false}/><Tooltip formatter={(v)=>int(Number(v))}/><Area dataKey="results" type="monotone" stroke="#00c96d" strokeWidth={3} fill="url(#campaignObjectiveArea)"/></AreaChart></ResponsiveContainer></div></div></section>;
}
function Brand(){return <div className="brand"><img className="brandOfficial" src="/scase-logo-light.svg" alt="SCASE • Branding, Design e Performance" /></div>}
function CampaignTable({rows,multiplier}:{rows:ReadonlyArray<(typeof baseCampaigns)[number]>;multiplier:number}){
 return <div className="tableScroll"><table className="campaignTable"><thead><tr>{["Campanha","Objetivo","Plataforma","Investimento","Indicador principal","Resultado","Indicador de eficiência","Valor"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(c=>{
 const m=campaignMetrics(c,multiplier);
 const efficiency=m.items[1] ?? {label:"Indicador",value:"—"};
 return <tr key={c.name}><td className="campaignName">{c.name}</td><td><span className="pill">{objectiveLabels[m.obj]}</span></td><td><span className={"network "+c.network}>{c.network==="google"?"Google Ads":"Meta Ads"}</span></td><td>{cash(m.cost)}</td><td>{m.items[0]?.label ?? "Resultado"}</td><td className="tableResult">{m.items[0]?.value ?? "—"}</td><td>{efficiency.label}</td><td className="tableResult">{efficiency.value}</td></tr>
 })}</tbody></table></div>;
}
