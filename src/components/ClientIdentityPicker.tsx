import {useEffect,useMemo,useRef,useState} from "react";
type Client={id:string;name:string};
type Profile={logo?:string};
const storageKey="scase-client-profiles-v1";
const read=():Record<string,Profile>=>{try{return JSON.parse(localStorage.getItem(storageKey)||"{}")}catch{return {}}};
export function ClientIdentityPicker({accounts,selected,onSelect,onProfileChange}:{accounts:Client[];selected:string;onSelect:(id:string)=>void;onProfileChange:(profile:Profile)=>void}){
 const [profiles,setProfiles]=useState<Record<string,Profile>>(read);
 const [search,setSearch]=useState("");
 const [open,setOpen]=useState(false);
 const [edit,setEdit]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 const account=accounts.find(a=>a.id===selected);
 const profile=profiles[selected]??{};
 const displayName=account?.name||"Selecione um cliente";
 const filtered=useMemo(()=>accounts.filter(a=>(a.name+" "+a.id).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))),[accounts,profiles,search]);
 useEffect(()=>{onProfileChange(profile)},[selected,profile.logo]);
 const save=(next:Profile)=>{const updated={...profiles,[selected]:{...profiles[selected],...next}};setProfiles(updated);try{localStorage.setItem(storageKey,JSON.stringify(updated))}catch{alert("Logo muito grande para salvar neste navegador. Escolha uma imagem menor.");}};
 const upload=async(file:File)=>{if(!file.type.startsWith("image/"))return;const image=new Image();const url=URL.createObjectURL(file);try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject();image.src=url});const canvas=document.createElement("canvas");const scale=Math.min(1,260/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);save({logo:canvas.toDataURL("image/png")});}finally{URL.revokeObjectURL(url)}};
 return <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
 <div style={{position:"relative",minWidth:230,flex:"1 1 230px"}}>
 <button type="button" onClick={()=>{setOpen(v=>!v);setSearch("");}} aria-expanded={open} style={{width:"100%",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"transparent",border:0,padding:"9px 0",color:"inherit",fontWeight:700}}>{displayName} {account?"· "+account.id:""} <span>⌄</span></button>
 {open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:60,width:"min(430px,85vw)",maxHeight:350,overflow:"auto",background:"white",border:"1px solid #d9e9df",borderRadius:12,boxShadow:"0 18px 35px #0002",padding:10,color:"#173e2d"}}>
 <input autoFocus aria-label="Pesquisar cliente pelo nome" placeholder="Digite o nome ou ID do cliente…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:11,border:"1px solid #d9e9df",borderRadius:8,marginBottom:9}}/>
 {filtered.map(a=><button key={a.id} type="button" onClick={()=>{onSelect(a.id);setOpen(false)}} style={{display:"block",width:"100%",textAlign:"left",padding:11,border:0,borderRadius:7,background:a.id===selected?"#ebf8ef":"white",color:"#173e2d"}}>{a.name} <small style={{opacity:.6}}>· {a.id}</small></button>)}{filtered.length===0&&<p style={{padding:10}}>Nenhuma conta encontrada na MCC.</p>}</div>}</div>
 {account&&<><button type="button" className="secondary" onClick={()=>{setEdit(v=>!v)}} style={{fontSize:12}}>Adicionar logo</button>{edit&&<div style={{width:"100%",display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,padding:12,border:"1px solid #d8e8de",background:"#f6fbf8",borderRadius:12}}>
 <button type="button" className="primary" onClick={()=>input.current?.click()}>Enviar logo do cliente</button>
 <input ref={input} type="file" accept="image/*" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/>
 {profile.logo&&<><img src={profile.logo} alt="Logo do cliente" style={{height:44,width:70,objectFit:"contain",background:"white",borderRadius:6}}/><button type="button" className="secondary" onClick={()=>save({logo:""})}>Remover logo</button></>}
 <button type="button" className="secondary" onClick={()=>setEdit(false)}>Concluir</button>
 <small style={{width:"100%",opacity:.7}}>O nome vem automaticamente do Google Ads. A logo fica salva neste navegador.</small></div>}</>}
 </div>;
}
