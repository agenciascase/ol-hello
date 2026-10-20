import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Activity, ArrowUpRight, BarChart3, Bell, BrainCircuit, ChevronDown, CreditCard, LayoutDashboard, LogOut, Megaphone, Search, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
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

type View = "dashboard" | "campaigns" | "reports" | "clients" | "settings";
type Network = "all" | "google" | "meta";
type Duration = "7" | "30" | "today";

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
 const [mobile,setMobile]=useState(false);
 const [alerts,setAlerts]=useState(true);
 const filtered=useMemo(()=>baseCampaigns.filter(c=>network==="all"||c.network===network).filter(c=>c.name.toLowerCase().includes(search.toLowerCase())),[network,search]);
 const multiplier=duration==="today"?1/30:duration==="7"?7/30:1;
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
 const menu:[View,string,React.ReactNode][]=[["dashboard","Visão geral",<LayoutDashboard size={18}/>],["campaigns","Campanhas",<Megaphone size={18}/>],["reports","Análises IA",<BrainCircuit size={18}/>],["clients","Clientes",<Users size={18}/>],["settings","Configurações",<Settings size={18}/>]];
 function selectPage(p:View){setView(p);setMobile(false)}
 async function handleSignOut(){
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
  navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
 }
 if(isLoading||!account)return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">Carregando sua conta…</p></div>;
 const isAdmin=account.isAdmin&&!viewAsClient;
 const displayName=account.name||account.email;
 const initials=(account.name||account.email||"SC").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
 return <div className="perf appShell">
  {mobile&&<div className="mobileShade" onClick={()=>setMobile(false)} />}
  <aside className={"side "+(mobile?"sideOpen":"")}><div className="sideBrand"><Brand/><button className="iconButton mobileOnly" onClick={()=>setMobile(false)}><X size={18}/></button></div><div className="agencyTag"><span className="signal"/> {isAdmin?"ESPAÇO DA AGÊNCIA":"PORTAL DO CLIENTE"}</div><div className="navLabel">MENU PRINCIPAL</div><nav>{menu.filter(([p])=>isAdmin||!["clients","settings"].includes(p)).map(([p,label,icon])=><button key={p} className={"navItem "+(view===p?"navActive":"")} onClick={()=>selectPage(p)}>{icon}<span>{label}</span></button>)}</nav><div className="sideBottom"><div className="helpBox"><BrainCircuit size={20}/><strong>Gestor de Tráfego IA</strong><p>Análises estratégicas para decisões mais inteligentes.</p><span>Em demonstração</span></div><button className="userBox" onClick={handleSignOut} title="Sair da conta"><span className="userAvatar">{initials}</span><span className="userDesc"><strong>{displayName}</strong><small>{isAdmin?"Agência · Administrador":account.company||"Cliente"}</small></span><LogOut size={17}/></button></div></aside>
  <div className="body"><header className="topbar"><button className="iconButton mobileOnly" onClick={()=>setMobile(true)}><span>☰</span></button><div className="breadcrumb">SCASE Performance <span>/</span> {menu.find(([v])=>v===view)?.[1]}</div><div className="topRight"><span className="demoChip"><span className="signal"/> Dados de demonstração</span><button className="iconButton" title="Notificações demonstrativas"><Bell size={19}/></button><span className="miniAvatar">{initials}</span></div></header>
  <main className="main"><div className="heading"><div><span className="eyebrow">CENTRAL DE RESULTADOS</span><h1>{view==="dashboard"?"Visão geral":view==="campaigns"?"Campanhas":view==="reports"?"Análises inteligentes":view==="clients"?"Gestão de clientes":"Configurações"}</h1><p>{view==="dashboard"?"Acompanhe a performance e descubra onde estão as oportunidades.":view==="campaigns"?"Desempenho detalhado das campanhas de mídia paga.":view==="reports"?"Histórico de análises estratégicas do gestor de tráfego IA.":view==="clients"?"Visão centralizada das contas atendidas pela agência.":"Preferências de monitoramento e notificações."}</p></div><div className="headingActions">{account.isAdmin&&!viewAsClient&&<button className="secondary" onClick={()=>{setViewAsClient(true);setView("dashboard")}}>Ver como cliente <ArrowUpRight size={16}/></button>}{account.isAdmin&&viewAsClient&&<button className="secondary" onClick={()=>{setViewAsClient(false);setView("dashboard")}}>Voltar à agência</button>}</div></div>
  {view!=="settings"&&<div className="filters"><div className="filterLeft"><div className="selectWrap"><span>Cliente</span><select disabled={!isAdmin} value={client} onChange={e=>setClient(Number(e.target.value))}>{customers.map((c,i)=><option key={c.name} value={i}>{c.name}</option>)}</select><ChevronDown size={15}/></div><div className="selectWrap"><span>Plataforma</span><select value={network} onChange={e=>setNetwork(e.target.value as Network)}><option value="all">Google + Meta</option><option value="google">Google Ads</option><option value="meta">Meta Ads</option></select><ChevronDown size={15}/></div></div><div className="periods">{(["today","7","30"] as const).map(p=><button key={p} onClick={()=>setDuration(p)} className={duration===p?"chosen":""}>{p==="today"?"Hoje":p==="7"?"7 dias":"30 dias"}</button>)}</div></div>}
  {view==="dashboard"&&<><div className="sectionTitle"><h2>Indicadores de performance</h2><span>Comparação ilustrativa com período anterior</span></div><div className="kpiGrid">{kpis.map((k,i)=><div className="kpi" key={k.label}><div className="kpiTop"><span>{k.label}</span><span className="kpiSymbol">{i===0?<Wallet size={17}/>:i===6?<Activity size={17}/>:<BarChart3 size={17}/>}</span></div><strong>{k.value}</strong><div className="kpiBottom"><span className="growth"><ArrowUpRight size={13}/>{k.delta}</span><span>vs. período anterior*</span></div></div>)}</div><div className="mainGrid"><section className="panel chartPanel"><div className="panelHead"><div><h2>Evolução do investimento</h2><p>Distribuição diária do período selecionado</p></div><span className="pill">● Atual　 ◯ Anterior</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="perfArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.23}/><stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5"/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{fill:"#98a1b0",fontSize:11}}/><Tooltip formatter={(v)=>cash(Number(v))}/><Area type="monotone" dataKey="previous" stroke="#b8c1d0" fill="none" strokeDasharray="5 4" strokeWidth={2}/><Area type="monotone" dataKey="current" stroke="var(--brand-accent)" fill="url(#perfArea)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></section><section className="panel insightPanel"><div className="panelHead"><div className="aiTitle"><BrainCircuit size={22}/><h2>Insights da IA</h2></div><span className="pill purple">DEMO</span></div><div className="insight"><div className="insightIcon">↗</div><div><strong>Campanhas de conversão em destaque</strong><p>O conjunto de conversão concentra a maior parte dos resultados atribuídos.</p></div></div><div className="insight"><div className="insightIcon">◎</div><div><strong>Oportunidade de otimização</strong><p>Compare o custo por lead antes de ampliar investimentos.</p></div></div><div className="insight"><div className="insightIcon">!</div><div><strong>Monitore o saldo das contas</strong><p>O alerta automático será ativado após integrar as APIs e o canal de envio.</p></div></div><button className="textLink" onClick={()=>setView("reports")}>Ver todas as análises <ArrowUpRight size={16}/></button></section></div></>}
  {view==="campaigns"&&<section className="panel"><div className="panelHead"><div><h2>Desempenho por campanha</h2><p>Dados ilustrativos, sem vínculo com contas reais</p></div><div className="searchBox"><Search size={16}/><input placeholder="Buscar campanha" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><CampaignTable rows={filtered} multiplier={multiplier}/></section>}
  {view==="dashboard"&&<section className="panel tablePanel"><div className="panelHead"><div><h2>Campanhas em destaque</h2><p>Visão consolidada do desempenho</p></div><button className="textLink" onClick={()=>setView("campaigns")}>Ver todas <ArrowUpRight size={16}/></button></div><CampaignTable rows={filtered.slice(0,4)} multiplier={multiplier}/></section>}
  {view==="reports"&&<><div className="reportTabs">{["Todas","Diária","Semanal","Quinzenal","Mensal"].map(t=><button className={reportFilter===t?"selected":""} key={t} onClick={()=>setReportFilter(t)}>{t}</button>)}</div><div className="reportsList">{history.filter(r=>reportFilter==="Todas"||r.type===reportFilter).map((r,i)=><article className="panel reportCard" key={i}><span className="reportIcon"><BrainCircuit size={21}/></span><div className="reportBody"><div className="reportMeta"><span className="pill">{r.type}</span><small>{r.date}</small></div><h2>{r.title}</h2><p>{r.text}</p><span className="reportDisclaimer">Exemplo de análise • nenhuma IA executada</span></div></article>)}</div></>}
  {view==="clients"&&<div className="clientsGrid">{customers.map((c,i)=><article className="panel clientCard" key={c.name}><div className="clientAvatar" style={{background:c.color}}>{c.short}</div><div><h2>{c.name}</h2><p>{c.tag}</p></div><span className="pill">{c.channels}</span><div className="clientFooter"><span><ShieldCheck size={15}/> Conta demonstrativa</span><button className="textLink" onClick={()=>{setClient(i);setView("dashboard")}}>Ver painel <ArrowUpRight size={15}/></button></div></article>)}</div>}
  {view==="settings"&&<div className="settingsGrid"><section className="panel settingsCard"><h2><Bell size={19}/> Alertas de saldo</h2><p>Monitore a disponibilidade de crédito das contas vinculadas.</p><label className="switchRow"><span>Alertas de saldo baixo <small>Configuração visual, sem verificações automáticas</small></span><input type="checkbox" checked={alerts} onChange={e=>setAlerts(e.target.checked)}/></label><div className="settingLine"><span>Limite sugerido</span><strong>Menos de 2 dias de cobertura</strong></div><div className="settingLine"><span>Frequência planejada</span><strong>A cada hora</strong></div></section><section className="panel settingsCard"><h2><BrainCircuit size={19}/> Rotinas de análises</h2><p>Agendamentos planejados para cada cliente.</p>{["Diária","Semanal","Quinzenal","Mensal"].map(s=><div className="settingLine" key={s}><span>{s}</span><span className="pill">Aguardando integração</span></div>)}</section><section className="panel settingsCard"><h2><CreditCard size={19}/> Integrações</h2><p>Conecte as plataformas na próxima etapa do projeto.</p>{["Google Ads","Meta Ads","WhatsApp"].map(s=><div className="settingLine" key={s}><span>{s}</span><span className="pill">Não conectado</span></div>)}</section></div>}
  <footer className="foot">SCASE Performance · Protótipo visual · *Variações e resultados são exclusivamente ilustrativos. Nenhum dado real está conectado.</footer>
  </main></div></div>;
}
function Brand(){return <div className="brand"><img className="brandOfficial" src="/scase-logo.svg" alt="SCASE • Branding, Design e Performance" /></div>}
function CampaignTable({rows,multiplier}:{rows:typeof baseCampaigns[number][]|readonly typeof baseCampaigns[number][];multiplier:number}){return <div className="tableScroll"><table className="campaignTable"><thead><tr>{["Campanha","Plataforma","Status","Investimento","Impressões","Cliques","CTR","CPC","Conversões","Custo/conv.","Receita","ROAS","Leads","CPL"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(c=>{const cost=c.cost*multiplier,views=c.views*multiplier,clicks=c.clicks*multiplier,conv=c.conversions*multiplier,rev=c.revenue*multiplier,leads=c.leads*multiplier;return <tr key={c.name}><td className="campaignName">{c.name}</td><td><span className={"network "+c.network}>{c.network==="google"?"Google Ads":"Meta Ads"}</span></td><td><span className="statusDot"/> {c.status}</td><td>{cash(cost)}</td><td>{int(views)}</td><td>{int(clicks)}</td><td>{pct(views?clicks/views*100:0)}</td><td>{cash(clicks?cost/clicks:0)}</td><td>{int(conv)}</td><td>{cash(conv?cost/conv:0)}</td><td>{cash(rev)}</td><td>{(cost?rev/cost:0).toFixed(2)}x</td><td>{int(leads)}</td><td>{cash(leads?cost/leads:0)}</td></tr>})}</tbody></table></div>}
