-- Gestor IA mais leve no tráfego do banco:
-- resumo  = versão pequena do cartão (é o que a lista baixa);
-- hash    = impressão digital do conteúdo (se não mudou, não regrava nem faz a página baixar de novo);
-- conferido_em = hora da última conferência (o agendador usa para saber quem atualizar).
alter table public.gestor_painel add column if not exists resumo jsonb;
alter table public.gestor_painel add column if not exists hash text;
alter table public.gestor_painel add column if not exists conferido_em timestamptz;
update public.gestor_painel set conferido_em = updated_at where conferido_em is null;
