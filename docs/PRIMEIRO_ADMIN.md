# Primeiro administrador SCASE Performance

E-mail autorizado a **solicitar** cadastro administrativo: `agenciascase@gmail.com`.

## Como concluir com segurança

1. Confirmar que o Lovable Cloud habilitou Email/Password em **Mais > Users**.
2. Publicar a versão que inclui o login real, caso necessário.
3. Abrir `https://ola-create-something.lovable.app/auth`, clicar em **Ainda não tenho conta**, cadastrar `agenciascase@gmail.com` e definir senha forte. Confirmar e-mail pelo link recebido.
4. Criar a tabela `user_roles` aplicando `supabase/migrations/20261020_scase_initial_roles.sql` pelo painel administrativo de banco **somente se ela ainda não existir**. Antes de aplicar, conferir esquema e migrações existentes; em caso de tabela já existente, não sobrescrever políticas existentes sem avaliação.
5. Em console de banco privilegiado (não em navegador nem repositório), obter o ID do usuário com e-mail verificado e atribuir o papel admin ao ID. Instrução SQL comentada no arquivo de migração. Não autorizar por email enviado pelo frontend.
6. Validar que outro usuário não consegue adquirir role admin, ler dados de outras organizações ou chamar endpoints de integração.
7. OAuth permanece bloqueado em `integration-security.server.ts` até autenticação server-side por sessão e auditoria de storage de tokens. Não retirar esse bloqueio só porque o papel foi inserido.

**Atenção:** executar SQL no painel de banco é uma ação privilegiada; não faça isso a partir de qualquer API pública nem exponha credenciais de service role.
