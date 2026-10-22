import {createCipheriv, createDecipheriv, randomBytes, createHash} from "node:crypto";
import {isAuthenticatedAgencyAdmin} from "./integration-security.server";
const required=(key:string)=>{const value=process.env[key];if(!value)throw new Error("Missing secure configuration: "+key);return value};
const encryptionKey=()=>{const secret=required("SCASE_TOKEN_ENCRYPTION_KEY");if(secret.length<32)throw new Error("Token encryption key is too short");return createHash("sha256").update(secret).digest()};
export function encryptToken(value:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);const enc=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64"),cipher.getAuthTag().toString("base64"),enc.toString("base64")].join(".")}
export function decryptToken(value:string){const [iv,tag,data]=value.split(".");if(!iv||!tag||!data)throw new Error("Invalid cipher");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));decipher.setAuthTag(Buffer.from(tag,"base64"));return Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString("utf8")}
function base(){return (process.env["SUPABASE_URL"]??required("VITE_SUPABASE_URL")).replace(/\/$/,"")}
function publishableKey(){return process.env["SUPABASE_PUBLISHABLE_KEY"]??required("VITE_SUPABASE_PUBLISHABLE_KEY")}
function jwtFromRequest(request:Request){return request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("scase_integration_session="))?.slice("scase_integration_session=".length)??request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]??null}
async function authorized(request:Request){
  if(!(await isAuthenticatedAgencyAdmin(request)))throw new Error("Administrator session required");
  const jwt=jwtFromRequest(request);if(!jwt)throw new Error("Missing administrator session");
  return {jwt,headers:{"apikey":publishableKey(),"authorization":"Bearer "+jwt,"content-type":"application/json"}};
}
type StoredRow={access_token_ciphertext:string;refresh_token_ciphertext:string|null;expires_at:string};
async function getStored(request:Request):Promise<StoredRow|null>{
 const {headers}=await authorized(request);
 const res=await fetch(base()+"/rest/v1/rpc/scase_ads_connection_get",{method:"POST",headers,body:JSON.stringify({p_provider:"google"}),cache:"no-store"});
 if(!res.ok)throw new Error("Secure credential lookup unavailable: "+res.status);
 const data=await res.json() as StoredRow[];
 return data[0]??null;
}
export async function adminUserId(request:Request):Promise<string|null>{
 try{
  const {jwt}=await authorized(request);
  const user=await fetch(base()+"/auth/v1/user",{headers:{"apikey":publishableKey(),"authorization":"Bearer "+jwt},cache:"no-store"});
  if(!user.ok)return null;
  const payload=await user.json() as {id?:string};
  return payload.id??null;
 }catch{return null}
}
export async function saveGoogleCredential(request:Request,tokens:{access_token:string;refresh_token?:string;expires_in?:number}){
 const existing=await getStored(request);
 const refresh=tokens.refresh_token?encryptToken(tokens.refresh_token):existing?.refresh_token_ciphertext;
 if(!refresh)throw new Error("Google did not provide a refresh token");
 const {headers}=await authorized(request);
 const res=await fetch(base()+"/rest/v1/rpc/scase_ads_connection_put",{
  method:"POST",headers,body:JSON.stringify({
   p_provider:"google",p_access_token_ciphertext:encryptToken(tokens.access_token),
   p_refresh_token_ciphertext:refresh,p_expires_at:new Date(Date.now()+(tokens.expires_in??3600)*1000).toISOString()
  }),cache:"no-store"
 });
 if(!res.ok)throw new Error("Secure credential storage unavailable: "+res.status);
}
export async function googleAccessToken(request:Request,refresh:(refreshToken:string)=>Promise<{access_token:string;expires_in?:number}>){
 const row=await getStored(request);if(!row)throw new Error("Google MCC not connected");
 if(Date.parse(row.expires_at)>Date.now()+60000)return decryptToken(row.access_token_ciphertext);
 if(!row.refresh_token_ciphertext)throw new Error("Google refresh token missing");
 const token=await refresh(decryptToken(row.refresh_token_ciphertext));
 await saveGoogleCredential(request,token);
 return token.access_token;
}
