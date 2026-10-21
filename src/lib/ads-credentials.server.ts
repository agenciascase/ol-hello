import {createCipheriv,createDecipheriv,randomBytes,createHash} from "node:crypto";
import {isAuthenticatedAgencyAdmin} from "./integration-security.server";
const required=(key:string)=>{const value=process.env[key];if(!value)throw new Error("Missing secure configuration: "+key);return value};
const encryptionKey=()=>{const secret=required("SCASE_TOKEN_ENCRYPTION_KEY");if(secret.length<32)throw new Error("Token encryption key is too short");return createHash("sha256").update(secret).digest()};
export function encryptToken(value:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);const enc=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64"),cipher.getAuthTag().toString("base64"),enc.toString("base64")].join(".")}
export function decryptToken(value:string){const [iv,tag,data]=value.split(".");if(!iv||!tag||!data)throw new Error("Invalid cipher");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));decipher.setAuthTag(Buffer.from(tag,"base64"));return Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString("utf8")}
function base(){return required("SUPABASE_URL").replace(/\/$/,"")}
function serviceHeaders(){return {"apikey":required("SUPABASE_SERVICE_ROLE_KEY"),"authorization":"Bearer "+required("SUPABASE_SERVICE_ROLE_KEY"),"content-type":"application/json"}}
export async function adminUserId(request:Request):Promise<string|null>{
 if(!(await isAuthenticatedAgencyAdmin(request)))return null;
 const token=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("scase_integration_session="))?.split("=")[1];
 if(!token)return null;
 const user=await fetch(base()+"/auth/v1/user",{headers:{"apikey":required("SUPABASE_SERVICE_ROLE_KEY"),"authorization":"Bearer "+token},cache:"no-store"});
 if(!user.ok)return null;
 const payload=await user.json() as {id?:string};
 return payload.id??null;
}
export async function saveGoogleCredential(userId:string,tokens:{access_token:string;refresh_token?:string;expires_in?:number}){
 const existing=await fetch(base()+"/rest/v1/ads_connections?select=refresh_token_ciphertext&provider=eq.google&owner_id=eq."+encodeURIComponent(userId),{headers:serviceHeaders(),cache:"no-store"});
 if(!existing.ok)throw new Error("Credential lookup failed");
 const old=await existing.json() as {refresh_token_ciphertext:string|null}[];
 const refresh=tokens.refresh_token?encryptToken(tokens.refresh_token):old[0]?.refresh_token_ciphertext;
 if(!refresh)throw new Error("Google did not provide a refresh token");
 const response=await fetch(base()+"/rest/v1/ads_connections?on_conflict=provider,owner_id",{method:"POST",headers:{...serviceHeaders(),"prefer":"resolution=merge-duplicates"},body:JSON.stringify({provider:"google",owner_id:userId,access_token_ciphertext:encryptToken(tokens.access_token),refresh_token_ciphertext:refresh,expires_at:new Date(Date.now()+(tokens.expires_in??3600)*1000).toISOString(),updated_at:new Date().toISOString()}),cache:"no-store"});
 if(!response.ok)throw new Error("Secure credential storage unavailable");
}
export async function googleAccessToken(userId:string,refresh:(refreshToken:string)=>Promise<{access_token:string;expires_in?:number}>) {
 const response=await fetch(base()+"/rest/v1/ads_connections?select=access_token_ciphertext,refresh_token_ciphertext,expires_at&provider=eq.google&owner_id=eq."+encodeURIComponent(userId)+"&limit=1",{headers:serviceHeaders(),cache:"no-store"});
 if(!response.ok)throw new Error("Google connection missing");
 const rows=await response.json() as {access_token_ciphertext:string;refresh_token_ciphertext:string|null;expires_at:string}[];
 const row=rows[0];if(!row)throw new Error("Google MCC not connected");
 if(Date.parse(row.expires_at)>Date.now()+60000)return decryptToken(row.access_token_ciphertext);
 if(!row.refresh_token_ciphertext)throw new Error("Google refresh token missing");
 const token=await refresh(decryptToken(row.refresh_token_ciphertext));
 await saveGoogleCredential(userId,token);
 return token.access_token;
}
