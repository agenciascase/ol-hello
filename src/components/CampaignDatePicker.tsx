import {useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,ChevronDown} from "lucide-react";
type Props={from:string;to:string;label:string;onApply:(from:string,to:string,label:string)=>void;comparePrevious:boolean;onCompareChange:(checked:boolean)=>void};
const iso=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const local=(s:string)=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const textDate=(s:string)=>s?local(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"Escolha uma data";
export function CampaignDatePicker({from,to,label,onApply,comparePrevious,onCompareChange}:Props){
 const [open,setOpen]=useState(false);
 const [start,setStart]=useState(from);
 const [end,setEnd]=useState(to);
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const today=new Date();today.setHours(0,0,0,0);
 const preset=(title:string,count:number,offset=0)=>{const last=new Date(today);last.setDate(last.getDate()-offset);const first=new Date(last);first.setDate(last.getDate()-count+1);setStart(iso(first));setEnd(iso(last));onApply(iso(first),iso(last),title);setOpen(false)};
 const choose=(day:string)=>{if(!start||end||day<start){setStart(day);setEnd("");}else setEnd(day)};
 const first=new Date(month.getFullYear(),month.getMonth(),1),days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 const cells=Array.from({length:first.getDay()},(_,i)=>"").concat(Array.from({length:days},(_,i)=>iso(new Date(month.getFullYear(),month.getMonth(),i+1))));
 return <div style={{position:"relative",minWidth:210}}>
 <button type="button" onClick={()=>{setStart(from);setEnd(to);setOpen(o=>!o)}} aria-expanded={open} aria-label="Selecionar período da campanha" style={{background:"#fff",border:"1px solid #d6e4da",color:"#143b2c",padding:"10px 13px",borderRadius:10,display:"flex",alignItems:"center",gap:9,width:"100%",justifyContent:"space-between",fontWeight:600}}>
 <CalendarDays size={16}/><span>{from&&to?(from===to?textDate(from):textDate(from)+" — "+textDate(to)):label||"Últimos 30 dias"}</span><ChevronDown size={15}/>
 </button>
 {open&&<div style={{position:"absolute",zIndex:80,right:0,top:"calc(100% + 8px)",width:"min(700px,calc(100vw - 32px))",maxHeight:"min(620px,80vh)",overflowY:"auto",background:"#fff",border:"1px solid #dfe7e1",borderRadius:12,boxShadow:"0 18px 50px #082c1c33",display:"grid",gridTemplateColumns:"minmax(135px,180px) minmax(230px,1fr)",color:"#172f26"}}>
 <div style={{borderRight:"1px solid #e0e8e1",padding:"14px 8px",display:"flex",flexDirection:"column",gap:3}}>
 <strong style={{padding:"8px 10px",fontSize:13}}>Períodos rápidos</strong>
 {([["Hoje",1,0],["Ontem",1,1],["7 dias atrás",7,0],["14 dias atrás",14,0],["30 dias atrás",30,0]] as const).map(([name,number,offset])=><button key={name} onClick={()=>preset(name,number,offset)} type="button" style={{textAlign:"left",background:label===name?"#e5f5ec":"transparent",border:0,borderRadius:6,padding:"10px",fontSize:13,color:"#193d2f"}}>{name}</button>)}
 <button type="button" onClick={()=>{const last=new Date(today.getFullYear(),today.getMonth(),0);preset("Último mês",last.getDate(),today.getDate())}} style={{textAlign:"left",border:0,background:"transparent",padding:10,fontSize:13}}>Último mês</button>
 <button type="button" onClick={()=>{const last=new Date(today);const firstDay=new Date(today.getFullYear(),today.getMonth(),1);preset("Este mês",Math.floor((last.getTime()-firstDay.getTime())/86400000)+1)}} style={{textAlign:"left",border:0,background:"transparent",padding:10,fontSize:13}}>Este mês</button>
 </div>
 <div style={{padding:"16px",minWidth:0}}>
 <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:13}}><label style={{fontSize:12}}>Data inicial<input aria-label="Data inicial" type="date" max={iso(today)} value={start} onChange={e=>setStart(e.target.value)} style={{width:"100%",display:"block",padding:8,border:"1px solid #cbdcd1",borderRadius:7}}/></label><label style={{fontSize:12}}>Data final<input aria-label="Data final" type="date" max={iso(today)} min={start||undefined} value={end} onChange={e=>setEnd(e.target.value)} style={{width:"100%",display:"block",padding:8,border:"1px solid #cbdcd1",borderRadius:7}}/></label></div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><strong style={{fontSize:13,textTransform:"capitalize"}}>{month.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</strong><div style={{display:"flex",gap:5}}><button aria-label="Mês anterior" type="button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button><button aria-label="Próximo mês" type="button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button></div></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:3}}>{["D","S","T","Q","Q","S","S"].map((d,i)=><span key={i} style={{textAlign:"center",fontSize:11,color:"#72877a",padding:5}}>{d}</span>)}{cells.map((d,i)=>d?<button key={d} type="button" disabled={d>iso(today)} onClick={()=>choose(d)} style={{border:"none",borderRadius:8,minHeight:35,padding:"5px 0",background:d===start||d===end?"#00b869":start&&end&&d>start&&d<end?"#e2f8eb":"transparent",color:d===start||d===end?"white":"#203c2d",cursor:"pointer"}}>{Number(d.slice(-2))}</button>:<span key={"empty"+i}/>)}</div>
 <label style={{display:"flex",alignItems:"center",gap:9,marginTop:18,padding:"11px 0",borderTop:"1px solid #e0e8e1",fontSize:13,fontWeight:700,cursor:"pointer"}}><input type="checkbox" checked={comparePrevious} onChange={e=>onCompareChange(e.target.checked)} style={{width:17,height:17,accentColor:"#00b969"}}/>Comparar com período anterior equivalente</label>
 <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:17}}><button type="button" onClick={()=>setOpen(false)} style={{padding:"9px 12px",border:"1px solid #dbe6dd",borderRadius:8}}>Cancelar</button><button type="button" disabled={!start||!end||start>end||end>iso(today)||((Date.parse(end)-Date.parse(start))/86400000)>365} onClick={()=>{onApply(start,end,"Personalizado");setOpen(false)}} style={{padding:"9px 16px",border:0,borderRadius:8,color:"white",background:"#06af65",fontWeight:700}}>Aplicar</button></div>
 </div></div>}
 </div>;
}
