import {useMemo,useState} from "react";
type Campaign={id:string;name:string};
export function CampaignPicker({campaigns,value,onChange,disabled=false,loading=false}:{campaigns:Campaign[];value:string;onChange:(id:string)=>void;disabled?:boolean;loading?:boolean}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState("");
 const selected=campaigns.find(c=>c.id===value);
 const filtered=useMemo(()=>campaigns.filter(c=>(c.name+" "+c.id).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))),[campaigns,search]);
 return <div style={{position:"relative",minWidth:180,maxWidth:290,flex:"1 1 180px"}}>
 <button type="button" disabled={disabled} aria-label="Selecionar campanha" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setSearch("")}} style={{width:"100%",display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",padding:"9px 4px",color:"inherit",border:0,background:"transparent",textAlign:"left",fontWeight:750,cursor:disabled?"not-allowed":"pointer"}}>
 <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{loading?"Carregando campanhas…":selected?.name??"Todas as campanhas"}</span><span aria-hidden="true">⌄</span></button>
 {open&&!disabled&&<div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:90,width:"min(420px,90vw)",maxHeight:360,overflowY:"auto",borderRadius:12,background:"#fff",border:"1px solid #dce8df",boxShadow:"0 18px 40px #0002",padding:10,color:"#17392b"}}>
 <input aria-label="Pesquisar campanha" autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar campanha pelo nome…" style={{width:"100%",padding:11,border:"1px solid #dce8df",borderRadius:8,marginBottom:8,color:"#17392b",background:"#fff"}}/>
 <button type="button" onClick={()=>{onChange("all");setOpen(false)}} style={{display:"block",width:"100%",padding:11,textAlign:"left",background:value==="all"?"#e6f8ee":"transparent",border:0,borderRadius:7,color:"#17392b",fontWeight:700}}>Todas as campanhas</button>
 {filtered.map(c=><button type="button" key={c.id} onClick={()=>{onChange(c.id);setOpen(false)}} style={{display:"block",width:"100%",padding:11,textAlign:"left",background:value===c.id?"#e6f8ee":"transparent",border:0,borderRadius:7,color:"#17392b"}}>{c.name}</button>)}
 {!filtered.length&&<p style={{padding:10,fontSize:12}}>Nenhuma campanha encontrada neste período.</p>}
 </div>}</div>;
}
