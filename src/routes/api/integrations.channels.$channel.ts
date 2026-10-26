import { createFileRoute } from "@tanstack/react-router";
import { errorMessage, noStore, requireAgencyAdmin, supabaseAdmin } from "../../lib/agency-api.server";
import { adminUserId } from "../../lib/ads-credentials.server";
import { removeChannel, saveChannel, sendEmailWith, verifyWhatsApp, type EmailConfig, type WhatsAppConfig } from "../../lib/delivery-channels.server";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const FROM_RE = /^(?:[^<>]{1,80}<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

const testEmailHtml = (from: string) =>
  `<div style="font-family:Arial,sans-serif;padding:24px;color:#0e2619"><h2 style="margin:0 0 8px">E-mail conectado à SCASE</h2><p>Os relatórios automáticos dos clientes vão sair pelo remetente <strong>${from.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</strong>.</p></div>`;

// Admin-only: connect, test or disconnect the e-mail and WhatsApp delivery channels.
export const Route = createFileRoute("/api/integrations/channels/$channel")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = await requireAgencyAdmin(request, { mutating: true });
        if (denied) return denied;
        const channel = params.channel;
        if (channel !== "email" && channel !== "whatsapp") return Response.json({ error: "Canal inválido." }, { status: 400, headers: noStore });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = str(body["action"]) || "connect";
        const userId = await adminUserId(request);
        try {
          if (action === "disconnect") {
            await removeChannel(channel);
            return Response.json({ ok: true }, { headers: noStore });
          }
          if (channel === "email") {
            const cfg: EmailConfig = { apiKey: str(body["apiKey"]), from: str(body["from"], 160) };
            if (!/^re_[A-Za-z0-9_]{10,}$/.test(cfg.apiKey)) return Response.json({ error: "A chave da API do Resend começa com re_. Confira se copiou a chave inteira." }, { status: 400, headers: noStore });
            if (!FROM_RE.test(cfg.from)) return Response.json({ error: "Remetente inválido. Use, por exemplo: SCASE Relatórios <relatorios@agenciascase.com.br>." }, { status: 400, headers: noStore });
            // Proves the key and the sender domain work before saving: a test message goes to the admin.
            const db = await supabaseAdmin();
            const me = userId ? (await db.auth.admin.getUserById(userId)).data.user?.email : null;
            if (!me) return Response.json({ error: "Não foi possível identificar o seu e-mail para o teste." }, { status: 400, headers: noStore });
            await sendEmailWith(cfg, [me], "Teste de conexão · Relatórios SCASE", testEmailHtml(cfg.from));
            await saveChannel("email", cfg, { from: cfg.from, testedWith: me }, userId);
            return Response.json({ ok: true, testedWith: me }, { headers: noStore });
          }
          const provider = str(body["provider"]) === "zapi" ? "zapi" : "meta";
          const cfg: WhatsAppConfig =
            provider === "zapi"
              ? { provider: "zapi", instanceId: str(body["instanceId"], 120), token: str(body["token"], 200), clientToken: str(body["clientToken"], 200) }
              : {
                  provider: "meta",
                  token: str(body["token"], 1000),
                  phoneNumberId: str(body["phoneNumberId"], 40),
                  templateName: str(body["templateName"], 120),
                  language: str(body["language"], 12) || "pt_BR",
                  documentHeader: body["documentHeader"] === true,
                };
          if (cfg.provider === "zapi" && (!cfg.instanceId || !cfg.token)) return Response.json({ error: "Informe o ID da instância e o token da Z-API." }, { status: 400, headers: noStore });
          if (cfg.provider === "meta" && (!cfg.token || !/^\d+$/.test(cfg.phoneNumberId) || !/^[a-z0-9_]+$/.test(cfg.templateName)))
            return Response.json({ error: "Informe o token, o ID do número (só dígitos) e o nome do modelo de mensagem aprovado (letras minúsculas, números e _)." }, { status: 400, headers: noStore });
          const number = await verifyWhatsApp(cfg);
          await saveChannel("whatsapp", cfg, { provider: cfg.provider === "zapi" ? "Z-API" : "API oficial da Meta", ...(number ? { number } : {}), ...(cfg.provider === "meta" ? { template: cfg.templateName } : {}) }, userId);
          return Response.json({ ok: true, number }, { headers: noStore });
        } catch (e) {
          return Response.json({ error: errorMessage(e, "Não foi possível conectar.") }, { status: 502, headers: noStore });
        }
      },
    },
  },
});
