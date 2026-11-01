import { createFileRoute } from "@tanstack/react-router";
import {
  anotarErro,
  bloqueado,
  emailDoHub,
  json,
  limparErros,
  loginComSenha,
  MSG_BLOQUEIO,
  origemConfere,
} from "../../lib/hub-acesso.server";

// Entrar no HUB com e-mail e senha digitados (o e-mail não vem preenchido na tela).
// e devolve a sessão. Erros seguidos bloqueiam por 15 minutos.
export const Route = createFileRoute("/api/hub/entrar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!origemConfere(request)) return json({ error: "Origem não autorizada" }, 403);
        if (bloqueado(request)) return json({ error: MSG_BLOQUEIO }, 429);
        const corpo = (await request.json().catch(() => ({}))) as {
          email?: unknown;
          senha?: unknown;
        };
        const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
        const senha = typeof corpo.senha === "string" ? corpo.senha : "";
        if (!email || !senha || senha.length > 128)
          return json({ error: "Digite o e-mail e a senha." }, 400);
        try {
          // e-mail diferente da conta do HUB: mesma resposta de senha errada (não dá pista)
          const sessao = email === emailDoHub() ? await loginComSenha(senha) : null;
          if (!sessao) {
            anotarErro(request);
            return json({ error: "E-mail ou senha incorretos. Confira e tente de novo." }, 401);
          }
          limparErros(request);
          return json(sessao);
        } catch {
          return json({ error: "O HUB não conseguiu falar com o banco de dados." }, 503);
        }
      },
    },
  },
});
