# Integrações Ads — implementação preparada

**Estado: código-base de OAuth preparado; conexões NÃO ativadas.** A aplicação mantém um login demonstrativo sem segurança real. Por isso, os endpoints de OAuth respondem 403 até existir sessão administrativa autenticada no servidor e controle de função por banco. Nunca transforme o seletor de visualização da interface em autorização.

## Identificadores da agência
- MCC Google Ads: `226-294-0733` (API / cabeçalho `login-customer-id`: `2262940733`)
- Meta Business Manager: `1914217738639420`

Esses IDs são públicos/identificadores, não credenciais de acesso.

## Google Ads
1. No Google Cloud, configurar projeto, tela de consentimento e cliente OAuth de tipo Web.
2. Cadastrar o endereço HTTPS `https://SEU-DOMINIO/api/integrations/google/callback` como URI de redirecionamento autorizado.
3. Configurar no backend `APP_ORIGIN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`. Não enviar tokens ao repositório.
4. Obter o Developer Token na central de API da MCC e confirmar nível de acesso para dados de produção.
5. Após habilitar autenticação administrativa real, iniciar com `/api/integrations/google/start`, confirmar acesso da conta autorizadora à MCC e solicitar consentimento para `https://www.googleapis.com/auth/adwords`.
6. Trocar o código de autorização no servidor; armazenar refresh token criptografado e associado à agência; usar access token de curta duração. Descobrir subcontas com recurso `customer_client` na MCC (não depender apenas de `listAccessibleCustomers`).
7. Paginar/percorrer a hierarquia conforme necessário e importar apenas clientes acessíveis. Respeitar fuso, limites, custos e quotas.

## Meta Ads
1. Criar aplicativo empresarial no Meta for Developers, configurar Facebook Login for Business e produto Marketing API.
2. Cadastrar URI HTTPS `https://SEU-DOMINIO/api/integrations/meta/callback` e configurar `META_APP_ID` e `META_APP_SECRET` no servidor.
3. Solicitar permissões de leitura `ads_read` e `business_management` com os níveis de acesso/revisão exigidos para as contas gerenciadas.
4. Após autenticação de admin, iniciar `/api/integrations/meta/start`. Trocar o código no servidor, gerenciar duração/renovação de token com segurança e listar contas da BM (incluindo contas próprias e de clientes, conforme as permissões e endpoints efetivos).
5. Implementar paginação, armazenar metadados de contas autorizadas e permitir vínculo manual com clientes SCASE.

## Antes de ativar os endpoints
- Implementar login real, validação server-side de função de admin e isolamento de organização/cliente.
- Implementar armazenamento criptografado dos tokens com acesso restrito ao servidor e política de revogação.
- Validar origem e cookies, proteção CSRF, scopes exatos, logs sem tokens, rate limits e tratamento de erros.
- Implementar callback concluindo consentimento somente após persistência segura e atualização do vínculo no banco.
- Adicionar status seguro à área de configurações: conectar, ver contas, sincronizar, desconectar.
- Rodar testes em ambiente de homologação e validar build antes de publicar.

**Não habilitar o OAuth enquanto a interface tiver login demonstrativo.** Os endpoints falham fechados por padrão.

Referências oficiais:
- https://developers.google.com/google-ads/api/rest/auth
- https://developers.google.com/google-ads/api/docs/oauth/access-model
- https://developers.facebook.com/docs/marketing-apis/
