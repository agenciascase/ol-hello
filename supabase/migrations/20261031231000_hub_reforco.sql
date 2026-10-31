-- HUB (Supabase próprio): mais fechado que o Lovable.
-- Nenhuma página pública lê tabelas direto (só funções), então o papel anônimo não acessa nenhuma tabela.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
-- has_role só é usada pelas regras de quem está logado.
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
