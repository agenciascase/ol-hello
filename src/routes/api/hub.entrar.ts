import { createFileRoute } from "@tanstack/react-router";
import {
  anotarErro,
  bloqueado,
  json,
  limparErros,
  loginComSenha,
  MSG_BLOQUEIO,
  origemConfere,
} from "../../lib/hub-acesso.server";

// Entrar no HUB só com a senha: o servidor completa o e-mail (que nunca vai para o navegador)
// e devolve a sessão. Erros seguidos bloqueiam por 15 minutos.
export const Route = createFileRoute("/api/hub/entrar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!origemConfere(request)) return json({ error: "Origem não autorizada" }, 403);
        if (bloqueado(request)) return json({ error: MSG_BLOQUEIO }, 429);
        const corpo = (await request.json().catch(() => ({}))) as { senha?: unknown };
        const senha = typeof corpo.senha === "string" ? corpo.senha : "";
        if (!senha || senha.length > 128) return json({ error: "Digite a senha." }, 400);
        try {
          const sessao = await loginComSenha(senha);
          if (!sessao) {
            anotarErro(request);
            return json({ error: "Senha incorreta. Confira e tente de novo." }, 401);
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
