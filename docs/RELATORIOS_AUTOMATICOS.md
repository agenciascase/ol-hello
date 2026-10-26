# Relatórios automatizados — como funciona e o que configurar

## Fluxo
1. **Integrações** (`/integracoes`): conecte a BM (1914217738639420) e a MCC (226-294-0733) e clique em **Sincronizar contas**. Todas as contas de anúncio da BM (próprias e de clientes) e as subcontas da MCC (sem managers e canceladas) vão para `ad_accounts_catalog`.
2. **Clientes** (`/clientes`): cadastre o cliente (e-mails, WhatsApp, fuso) e vincule as contas do catálogo.
3. Na ficha do cliente, crie um **relatório** (plataformas, métricas, período, comparação, filtro de campanhas, mensagem, canais) e uma ou mais **agendas** (semanal, quinzenal ou mensal, com horário no fuso do cliente).
4. O agendador (`/api/cron/reports`) roda a cada 15 minutos, pega as agendas vencidas, reserva cada uma de forma atômica (sem envio duplicado), gera o relatório com dados reais, o PDF e envia por e-mail e/ou WhatsApp. Tudo fica em `report_deliveries` e aparece no **Histórico de envios**.
5. Cada relatório tem um link público revogável (`/live/r…`) com o painel ao vivo e o PDF (`/api/report-pdf?token=r…`).

Botões na ficha: **Gerar agora** (abre o painel), **Copiar link**, **PDF** (pré-visualização) e **Enviar agora** (envio manual).

## Secrets (Lovable Cloud → Secrets)
| Secret | Para quê |
| --- | --- |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Obrigatório em todas as chamadas ao Google Ads |
| `APP_ORIGIN` | Já existe para o OAuth; usado nos links dos e-mails/WhatsApp |
| `RESEND_API_KEY`, `REPORT_EMAIL_FROM` | E-mail. Ex.: `SCASE Relatórios <relatorios@agenciascase.com.br>` (domínio verificado no Resend) |
| `WHATSAPP_PROVIDER` | `meta` (padrão) ou `zapi` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` | API oficial (Meta Cloud API) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Opcional, padrão `pt_BR` |
| `WHATSAPP_TEMPLATE_DOCUMENT_HEADER` | `true` se o template tiver cabeçalho do tipo documento (o PDF vai anexado) |
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` | Se usar Z-API |
| `LOVABLE_CRON_SECRET` | Senha que o agendador envia em `Authorization: Bearer …` |

A tela de Integrações mostra quais estão preenchidos (nunca os valores).

## Template do WhatsApp (API oficial)
Mensagens iniciadas pela empresa precisam de um template aprovado (categoria *Utilidade*). Sugestão:

- Cabeçalho (opcional): **Documento**
- Corpo: `Olá! Segue o relatório de performance de {{1}} referente a {{2}}. Acompanhe os números ao vivo: {{3}}`
- Variáveis enviadas: `{{1}}` nome do cliente, `{{2}}` período, `{{3}}` link do painel.

Com Z-API não há template: o PDF vai como documento com legenda.

## Ligando o agendador
O banco não tem `pg_cron`. Use uma das opções, chamando a cada 15 minutos:

```
POST https://ola-create-something.lovable.app/api/cron/reports
Authorization: Bearer <LOVABLE_CRON_SECRET>
```

- **Agendador do Lovable**, se disponível no projeto; ou
- serviço externo (cron-job.org, GitHub Actions `schedule`, Upstash QStash) com o cabeçalho acima.

A resposta lista o que foi processado; falhas também ficam no histórico do cliente.

## Banco
Migrações: `drizzle/migrations/0001_reporting_platform_stage1.sql` e `0002_reporting_platform_stage2.sql` (já aplicadas). Todas as tabelas têm RLS liberando só usuários com papel `admin`; o agendador e as rotas públicas usam a service role no servidor.

## Relatório completo (v2)
- **Nível de detalhe por relatório**: *Essencial* (resumo, principais números, metas e análise), *Padrão* (+ evolução diária, funil, conversões por tipo, campanhas) e *Completo* (+ criativos, termos de pesquisa, público, histórico de 6 meses). Seções e métricas podem ser ajustadas uma a uma; seções sem dados são omitidas.
- **Objetivo do cliente** (leads, vendas, tráfego, alcance) define as métricas em destaque e o texto dos destaques automáticos.
- **Metas e verba** no cadastro do cliente: verba mensal, conversões/mês, custo por conversão e ROAS. O relatório mostra status (dentro/atenção/fora) e o ritmo da verba com projeção do mês.
- **Impostos** (% Meta e % Google) no cliente: o relatório mostra o investimento com impostos, próximo da fatura.
- **Análise da equipe**, **o que fizemos** e **próximos passos** em cada relatório, com botão "Sugerir a partir dos números".
- **Cache de 30 min** (`report_cache`) para o painel público não consumir a cota diária das APIs; envios e PDF do admin usam dados atualizados.
- Conversões da Meta = leads + conversas iniciadas + compras.
- Migração: `drizzle/migrations/0003_relatorio_completo.sql` (já aplicada).

## Canais de envio pela tela de Integrações
E-mail (Resend) e WhatsApp (API oficial da Meta ou Z-API) podem ser conectados direto em **Integrações → Canais de envio**, sem mexer nos Secrets. As credenciais são conferidas com o provedor (o e-mail envia um teste para o administrador) e guardadas criptografadas na tabela `delivery_channels` (migração `0004_canais_envio.sql`, já aplicada). Os Secrets antigos continuam valendo como alternativa.
