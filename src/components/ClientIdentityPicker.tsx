import {useEffect,useMemo,useRef,useState} from "react";
type Client={id:string;name:string};
type Profile={name?:string;logo?:string};
const storageKey="scase-client-profiles-v1";
const read=():Record<string,Profile>=>{try{return JSON.parse(localStorage.getItem(storageKey)||"{}")}catch{return {}}};
export function ClientIdentityPicker({accounts,selected,onSelect,onProfileChange}:{accounts:Client[];selected:string;onSelect:(id:string)=>void;onProfileChange:(profile:Profile)=>void}){
 const [profiles,setProfiles]=useState<Record<string,Profile>>(read);
 const [search,setSearch]=useState("");
 const [open,setOpen]=useState(false);
 const [edit,setEdit]=useState(false);
 const [name,setName]=useState("");
 const input=useRef<HTMLInputElement>(null);
 const account=accounts.find(a=>a.id===selected);
 const profile=profiles[selected]??{};
 const displayName=profile.name||account?.name||"Selecione um cliente";
 const filtered=useMemo(()=>accounts.filter(a=>(a.name+" "+a.id+" "+(profiles[a.id]?.name||"")).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))),[accounts,profiles,search]);
 useEffect(()=>{onProfileChange(profile)},[selected,profile.name,profile.logo]);
 const save=(next:Profile)=>{const updated={...profiles,[selected]:{...profiles[selected],...next}};setProfiles(updated);try{localStorage.setItem(storageKey,JSON.stringify(updated))}catch{alert("Logo muito grande para salvar neste navegador. Escolha uma imagem menor.");}};
 const upload=async(file:File)=>{if(!file.type.startsWith("image/"))return;const image=new Image();const url=URL.createObjectURL(file);try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject();image.src=url});const canvas=document.createElement("canvas");const scale=Math.min(1,260/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);save({logo:canvas.toDataURL("image/png")});}finally{URL.revokeObjectURL(url)}};
 return <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
 <div style={{position:"relative",minWidth:230,flex:"1 1 230px"}}>
 <button type="button" onClick={()=>{setOpen(v=>!v);setSearch("");}} aria-expanded={open} style={{width:"100%",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"transparent",border:0,padding:"9px 0",color:"inherit",fontWeight:700}}>{displayName} {account?"· "+account.id:""} <span>⌄</span></button>
 {open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:60,width:"min(430px,85vw)",maxHeight:350,overflow:"auto",background:"white",border:"1px solid #d9e9df",borderRadius:12,boxShadow:"0 18px 35px #0002",padding:10,color:"#173e2d"}}>
 <input autoFocus aria-label="Pesquisar cliente pelo nome" placeholder="Digite o nome ou ID do cliente…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:11,border:"1px solid #d9e9df",borderRadius:8,marginBottom:9}}/>
 {filtered.map(a=><button key={a.id} type="button" onClick={()=>{onSelect(a.id);setOpen(false)}} style={{display:"block",width:"100%",textAlign:"left",padding:11,border:0,borderRadius:7,background:a.id===selected?"#ebf8ef":"white",color:"#173e2d"}}>{profiles[a.id]?.name||a.name} <small style={{opacity:.6}}>· {a.id}</small></button>)}{filtered.length===0&&<p style={{padding:10}}>Nenhuma conta encontrada na MCC.</p>}</div>}</div>
 {account&&<><button type="button" className="secondary" onClick={()=>{setName(profile.name||account.name);setEdit(v=>!v)}} style={{fontSize:12}}>Editar nome e logo</button>{edit&&<div style={{width:"100%",display:"grid",gridTemplateColumns:"1fr auto",gap:10,padding:12,border:"1px solid #d8e8de",background:"#f6fbf8",borderRadius:12}}>
 <label style={{fontSize:12}}>Nome exibido<input value={name} onChange={e=>setName(e.target.value)} style={{display:"block",width:"100%",padding:9,marginTop:5,border:"1px solid #cad9cf",borderRadius:7}}/></label><div style={{display:"flex",alignItems:"end",gap:8}}><button type="button" className="secondary" onClick={()=>input.current?.click()}>Adicionar logo</button><input ref={input} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/></div>
 <div style={{gridColumn:"1/-1",display:"flex",gap:8}}><button type="button" className="primary" onClick={()=>{save({name:name.trim()||account.name});setEdit(false)}}>Salvar nome</button>{profile.logo&&<button type="button" className="secondary" onClick={()=>save({logo:""})}>Remover logo</button>}</div><small style={{gridColumn:"1/-1",opacity:.7}}>Nome e logo personalizados ficam salvos neste navegador. O nome original vem da MCC Google Ads.</small></div>}</>}
 </div>;
}
