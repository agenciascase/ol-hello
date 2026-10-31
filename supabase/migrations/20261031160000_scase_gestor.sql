-- Scase Gestor dentro do Dashboard: cartões por cliente (atualizados pelo servidor, sem IA)
-- e pedidos feitos na página (Otimizar, Subir campanha...), que só são executados depois de aprovados.
-- Tudo novo: não altera nenhuma tabela existente além de uma coluna opcional em clients.

alter table public.clients add column if not exists gestor text;

create table if not exists public.gestor_painel (
  client_id uuid primary key references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  erro text,
  updated_at timestamptz not null default now()
);

create table if not exists public.gestor_pedidos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null check (tipo in ('otimizar', 'ignorar', 'campanha', 'ativar', 'alteracao')),
  chave text,
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'pendente',
  resultado text,
  desfazer text,
  link text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists gestor_pedidos_cliente on public.gestor_pedidos (client_id, criado_em desc);
create index if not exists gestor_pedidos_status on public.gestor_pedidos (status);

grant select on public.gestor_painel to authenticated;
grant select, insert, update, delete on public.gestor_pedidos to authenticated;
grant all on public.gestor_painel to service_role;
grant all on public.gestor_pedidos to service_role;

alter table public.gestor_painel enable row level security;
alter table public.gestor_pedidos enable row level security;

drop policy if exists "Admins leem o painel do gestor" on public.gestor_painel;
create policy "Admins leem o painel do gestor" on public.gestor_painel
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins gerenciam pedidos do gestor" on public.gestor_pedidos;
create policy "Admins gerenciam pedidos do gestor" on public.gestor_pedidos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
