// Browser helpers for the agency's admin API routes.
import { supabase } from "@/integrations/supabase/client";

async function bearer() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
  return token;
}

/** Calls an admin API route with the current Supabase session and returns its JSON (throws on error). */
export async function agencyApi<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const token = await bearer();
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { authorization: "Bearer " + token, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Falha na requisição (${res.status})`);
  return data;
}

/** Downloads a binary admin response (e.g. the report PDF) as a file. */
export async function agencyDownload(path: string, fallbackName: string) {
  const token = await bearer();
  const res = await fetch(path, { headers: { authorization: "Bearer " + token }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Não foi possível baixar o arquivo.");
  }
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Starts the OAuth consent flow for the agency's Google MCC or Meta Business Manager. */
export async function connectProvider(provider: "google" | "meta") {
  const token = await bearer();
  if (provider === "google") {
    const res = await fetch("/api/integrations/session", { method: "POST", headers: { authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Sua sessão administrativa não foi autorizada.");
    window.location.assign("/api/integrations/google/start");
    return;
  }
  const res = await fetch("/api/integrations/meta/start", { method: "POST", headers: { authorization: "Bearer " + token } });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || "Não foi possível iniciar a conexão com a Meta.");
  window.location.assign(body.url);
}

export async function currentUserIsAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some((r) => r.role === "admin");
}
