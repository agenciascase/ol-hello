import {createFileRoute} from "@tanstack/react-router";
import {adminUserId,metaAccessToken} from "../../lib/ads-credentials.server";
type AdAccount={id:string;name:string;account_id?:string;currency?:string;account_status?:number};
export const Route=createFileRoute("/api/integrations/meta/accounts")({server:{handlers:{GET:async({request})=>{
 if(!(await adminUserId(request)))return Response.json({error:"Acesso administrativo necessário."},{status:403});
 try{
  const token=await metaAccessToken(request);
  const accounts=new Map<string,AdAccount>();
  const errors:string[]=[];
  const fetchPages=async(path:string,collect:(data:Array<Record<string,unknown>>)=>void)=>{
   let next="https://graph.facebook.com/v24.0/"+path;
   for(let i=0;i<15&&next;i++){
    const res=await fetch(next,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const result=await res.json() as {data?:Array<Record<string,unknown>>;paging?:{next?:string};error?:{message?:string;code?:number}};
    if(!res.ok){errors.push(result.error?.message||"Erro na consulta à Meta ("+res.status+").");return;}
    collect(result.data??[]);
    const nextUrl=result.paging?.next;
    next=nextUrl&&/^https:\/\/graph\.facebook\.com\//.test(nextUrl)?nextUrl:"";
   }
  };
  const add=(rows:Array<Record<string,unknown>>)=>{for(const row of rows){
   const id=String(row.id??"");
   if(/^act_\d+$/.test(id))accounts.set(id,{id,name:String(row.name??id),account_id:String(row.account_id??id.slice(4)),currency:String(row.currency??""),account_status:Number(row.account_status??0)});
  }};
  // The user's direct ad-account list often differs from agency Business Manager assets.
  await fetchPages("me/adaccounts?fields=id,name,account_id,currency,account_status&limit=100",add);
  const businesses:Array<{id:string;name:string}>=[];
  await fetchPages("me/businesses?fields=id,name&limit=100",rows=>{for(const row of rows)if(/^\d+$/.test(String(row.id??"")))businesses.push({id:String(row.id),name:String(row.name??"")})});
  for(const business of businesses){
   for(const edge of ["owned_ad_accounts","client_ad_accounts"]){
    await fetchPages(business.id+"/"+edge+"?fields=id,name,account_id,currency,account_status&limit=100",add);
   }
  }
  return Response.json({accounts:[...accounts.values()],businesses:businesses.length,notes:accounts.size?[]:["Nenhuma conta de anúncios retornada. Confira o acesso do perfil que autorizou o app às contas no Meta Business."],errors},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Conexão Meta indisponível."},{status:503});}
}}}});
