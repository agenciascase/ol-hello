/**
 * Fail-closed admin authentication for ads connection endpoints.
 * A user must be authenticated with Supabase AND have an admin row in user_roles.
 * On the browser a short-lived, HttpOnly cookie is minted by /api/integrations/session.
 */
const cookieName="scase_integration_session";
export function sessionCookieName(){return cookieName;}
export async function isAuthenticatedAgencyAdmin(request:Request):Promise<boolean>{
 const token=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ??
  request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(cookieName+"="))?.slice(cookieName.length+1);
 if(!token)return false;
 const endpoint=process.env["SUPABASE_URL"]??process.env["VITE_SUPABASE_URL"];
 const key=process.env["SUPABASE_PUBLISHABLE_KEY"]??process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
 if(!endpoint||!key)return false;
 const base=endpoint.replace(/\/$/,"");
 try{
  const auth=await fetch(base+"/auth/v1/user",{headers:{"apikey":key,authorization:"Bearer "+token},cache:"no-store"});
  if(!auth.ok)return false;
  const user=await auth.json() as {id?:string};
  if(!user.id)return false;
  const role=await fetch(base+"/rest/v1/user_roles?select=role&user_id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&limit=1",{headers:{"apikey":key,authorization:"Bearer "+token},cache:"no-store"});
  if(!role.ok)return false;
  const rows=await role.json() as {role:string}[];
  return Array.isArray(rows)&&rows.some(r=>r.role==="admin");
 }catch{return false;}
}
export const NOT_READY="Você precisa estar autenticado como administrador da SCASE.";
