/**
 * OAuth utilities: server-only. Never import from UI components.
 * The connection endpoints must be protected by real agency-admin authentication.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type Provider = "google" | "meta";
export const MCC_CUSTOMER_ID = "2262940733";
export const META_BUSINESS_ID = "1914217738639420";

export function config(provider: Provider) {
  const origin = required("APP_ORIGIN").replace(/\/$/, "");
  if (!origin.startsWith("https://") && !origin.startsWith("http://localhost:")) throw new Error("APP_ORIGIN must be HTTPS (localhost allowed for development)");
  return provider === "google"
    ? { clientId: required("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
        redirectUri: `${origin}/api/integrations/google/callback`,
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token" }
    : { clientId: required("META_APP_ID"), clientSecret: required("META_APP_SECRET"),
        redirectUri: `${origin}/api/integrations/meta/callback`,
        authUrl: "https://www.facebook.com/v24.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v24.0/oauth/access_token" };
}
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server environment variable: ${key}`);
  return value;
}
export function authUrl(provider: Provider, state: string): string {
  const c = config(provider);
  const url = new URL(c.authUrl);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", c.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if(provider==="google"){
    url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else {
    url.searchParams.set("scope", "ads_read,business_management");
  }
  return url.toString();
}
export function newState(){return randomBytes(32).toString("hex");}
export function stateHash(state: string){return createHash("sha256").update(state).digest("hex");}
export function constantTimeEqual(a: string,b: string){
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export async function exchangeCode(provider: Provider, code: string) {
  const c=config(provider);
  const data=new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,code,grant_type:"authorization_code"});
  const res=await fetch(c.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:data.toString(),cache:"no-store"});
  if(!res.ok) throw new Error(`${provider} OAuth exchange failed (${res.status})`);
  return await res.json() as {access_token:string;refresh_token?:string;expires_in?:number};
}
export async function googleAccounts(accessToken:string){
  const devToken=required("GOOGLE_ADS_DEVELOPER_TOKEN");
  const api=process.env["GOOGLE_ADS_API_VERSION"]||"v26";
  const response=await fetch(`https://googleads.googleapis.com/${api}/customers/${MCC_CUSTOMER_ID}/googleAds:searchStream`,{
    method:"POST",headers:{authorization:`Bearer ${accessToken}`,"developer-token":devToken,"login-customer-id":MCC_CUSTOMER_ID,"content-type":"application/json"},
    body:JSON.stringify({query:"SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level <= 2"}),
    cache:"no-store"
  });
  if(!response.ok) throw new Error(`Google Ads account discovery failed (${response.status})`);
  return response.json();
}
export async function metaAccounts(accessToken:string){
  const url=new URL(`https://graph.facebook.com/v24.0/${META_BUSINESS_ID}/client_ad_accounts`);
  url.searchParams.set("fields","id,name,account_id,account_status,currency");
  url.searchParams.set("limit","100");
  const response=await fetch(url,{headers:{authorization:`Bearer ${accessToken}`},cache:"no-store"});
  if(!response.ok) throw new Error(`Meta account discovery failed (${response.status})`);
  // Results may be paginated; follow API paging.next on server only after host validation.
  return response.json();
}
