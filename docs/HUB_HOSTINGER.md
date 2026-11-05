# HUB Scase na Hostinger

O HUB é este mesmo sistema (Dashboards, Gestor IA, Clientes, Integrações, relatórios) rodando como
app **Node.js** na Hostinger, em `https://hub.agenciascase.com.br`, com banco próprio no Supabase
(projeto `scase-hub`, São Paulo). Não usa nada da Lovable.

> Este repositório é público: aqui só aparecem NOMES de variáveis. Os valores secretos ficam só nas
> variáveis do servidor na Hostinger.

## Compilar e iniciar

- Node 22 (22.12 ou mais novo).
- Instalar: `npm install` ou `npm ci` (o `.npmrc` já liga `legacy-peer-deps` e usa registry.npmjs.org;
  versões fixas no `package-lock.json`; neste ramo não há `bun.lock`).
- Compilar: `npm run build:hub` (ou `npm run build`: os dois usam o endereço e a chave **pública** do
  Supabase do HUB, em `.env` / `.env.hub`).
- Iniciar: arquivo de entrada **`app.js`** (`npm start` = `node app.js`); porta pela variável `PORT`.
  Funciona rodado direto (`node app.js`) ou carregado por outro programa (`require`).

Na Hostinger (hPanel → Websites → Add Website → Node.js web app → GitHub): repositório
`agenciascase/ol-hello`, ramo **`hub`**, Node 22, comando de compilação `build:hub`, arquivo de
entrada `app.js`.

## Variáveis do servidor

| Variável | Para quê | Onde pegar |
|---|---|---|
| `SUPABASE_URL` | banco do HUB | `https://pdziemapzalaxtaahlyi.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | banco do HUB (chave pública) | mesma do `.env.hub` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta**: servidor lê/grava o banco | Supabase → Project Settings → API Keys → Secret key |
| `APP_ORIGIN` | endereço público (links e retorno do login Meta/Google) | `https://hub.agenciascase.com.br` |
| `SCASE_TOKEN_ENCRYPTION_KEY` | **secreta**: criptografa as conexões Meta/Google e os canais de envio | texto aleatório novo, 32+ caracteres |
| `SCASE_CRON_SECRET` | **secreta**: chave do Cron | texto aleatório novo, 24+ caracteres |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | conectar o Google Ads | cliente OAuth **"Aplicativo da Web"** novo no projeto Google Cloud "Agente de Trafego" (o do ambiente do Claude é "App para computador" e não aceita retorno de site) |
| `META_APP_ID`, `META_APP_SECRET` | conectar a Meta | app da Meta (developers.facebook.com) |
| `AGENTE_TOKEN` | **secreta**: a tarefa do Claude lê e responde os pedidos | mesmo valor de `SCASE_PAINEL_TOKEN` no ambiente "Agente de tráfego" do Claude |
| `ROTINA_URL` | chamar a tarefa do Claude | `https://api.anthropic.com/v1/claude_code/routines/trig_01HXJbgqbmwru6XFQhJivsnD/fire` |
| `ROTINA_TOKEN` | **secreta**: chamar a tarefa do Claude | claude.ai/code/routines → tarefa → Edit → Trigger → API → Generate token |

Opcionais: `GOOGLE_ADS_DEVELOPER_TOKEN` (o projeto Google Cloud "Agente de Trafego" já tem acesso aprovado à API), `GOOGLE_ADS_API_VERSION` (padrão v26), `META_LOGIN_CONFIG_ID`, `ANTHROPIC_API_KEY`
(texto de análise dos relatórios; sem ela o texto é montado dos números), `HUB_BACKUP_DIR`
(padrão `~/hub-backups`), `HUB_EMAIL` (e-mail da conta única; fica só no servidor).
WhatsApp pelo QR Code (grátis, envia o PDF nos GRUPOS): Integrações → Conectar WhatsApp → "WhatsApp pelo QR Code" → ler o QR no celular (Aparelhos conectados). A sessão fica em `HUB_WHATSAPP_DIR` (padrão `~/hub-whatsapp/sessao`, fora do site, só o dono lê). No relatório, "Grupos do WhatsApp" lista os grupos do número conectado.
E-mail (Resend) e WhatsApp (Z-API ou Meta) são conectados na página **Integrações** do HUB
(ficam criptografados no banco); as variáveis `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `ZAPI_*` e
`WHATSAPP_*` só servem de reserva.

## Cron da Hostinger (hPanel → Avançado → Cron Jobs)

Todas as chamadas usam a mesma chave (`SCASE_CRON_SECRET`):

| Quando | Comando |
|---|---|
| `7,22,37,52 * * * *` | `curl -fsS -m 30 -H "Authorization: Bearer <SCASE_CRON_SECRET>" "https://hub.agenciascase.com.br/api/cron/hub?tarefa=gestor" > /dev/null` |
| `3,18,33,48 * * * *` | `curl -fsS -m 30 -H "Authorization: Bearer <SCASE_CRON_SECRET>" "https://hub.agenciascase.com.br/api/cron/hub?tarefa=relatorios" > /dev/null` |
| `13 7 * * *` | `curl -fsS -m 120 -H "Authorization: Bearer <SCASE_CRON_SECRET>" "https://hub.agenciascase.com.br/api/cron/hub?tarefa=backup" > /dev/null` |

- `gestor`: atualiza todos os cartões do Gestor IA em segundo plano. O próprio servidor só roda das
  6h às 22h de Brasília (não depende do fuso do servidor). A página confere nos minutos 10/25/40/55.
- `relatorios`: envia os relatórios agendados e chama o Claude de novo se um pedido ficou parado
  mais de 10 minutos.
- `backup`: cópia das tabelas importantes em `~/hub-backups/hub-AAAA-MM-DD.json.gz` (guarda 30 dias).
- `?tarefa=estado`: mostra como foram as últimas rodadas (só números).

## Pedidos do Gestor IA → Claude

1. Na página Gestor IA alguém confirma (Otimizar, Subir campanha, Ativar, Pedir alteração): o pedido
   é gravado em `gestor_pedidos` e a página chama `/api/gestor/avisar`.
2. O servidor chama a tarefa do Claude (`ROTINA_URL` + `ROTINA_TOKEN`), no máximo uma vez a cada 45 s.
3. A tarefa do Claude lê a fila e grava o andamento em `/api/agente/pedidos`
   (`Authorization: Bearer <AGENTE_TOKEN>`):
   - `GET` → pedidos `pendente`, `ativando`, `executando`, `criando`, com cliente, gestor e contas.
   - `POST {id, status, resultado, desfazer, link}` → status: `executando`, `feito`, `precisa_voce`,
     `erro`, `criando`, `criada`, `ativa`.

## Login (Supabase → Authentication)

- Cadastro de novos usuários: **desligado**.
- URL Configuration → Site URL `https://hub.agenciascase.com.br`; Redirect URLs `https://hub.agenciascase.com.br/**`.
- A tela de login pede **e-mail e senha**, com o campo de e-mail **em branco** (não vem preenchido). O servidor confere
  os dois (`/api/hub/entrar`) e não diz qual está errado.
- Primeiro acesso: "Crie a senha do HUB" pede o e-mail, o **código de instalação** = valor do `SCASE_CRON_SECRET`
  (ou `HUB_CODIGO_INSTALACAO`, se existir). Depois disso o sistema recusa criar outra senha.
- 5 senhas erradas seguidas (por IP) ou 30 no total bloqueiam o login por 15 minutos.
- Para recomeçar: apagar o usuário em Supabase → Authentication → Users.

## Retorno do login da Meta e do Google

- Google Cloud (cliente OAuth) → URI de redirecionamento: `https://hub.agenciascase.com.br/api/integrations/google/callback`
- App da Meta → URI de redirecionamento OAuth válido: `https://hub.agenciascase.com.br/api/integrations/meta/callback`

## Banco

Estrutura = migrações de `drizzle/migrations/0000..0008` + `supabase/migrations/` (menos
`20261020_scase_initial_roles.sql`, versão antiga de `user_roles`, e `20261021180000_campaign_shares.sql`,
link de campanha desligado no código). No HUB o papel anônimo não acessa nenhuma tabela (só funções).
