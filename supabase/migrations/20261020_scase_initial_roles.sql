-- SCASE Performance: roles must be assigned server-side, never by user metadata.
create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff','client')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists user_roles_role_idx on public.user_roles(role);
alter table public.user_roles enable row level security;

-- No client may insert/update/delete roles. Roles visible only to their owner.
drop policy if exists "Read own roles" on public.user_roles;
create policy "Read own roles" on public.user_roles
 for select to authenticated using (user_id = auth.uid());

-- Admin bootstrap is deliberately NOT automatic based only on email.
-- After signup and verification, execute this ONE-TIME SQL in a trusted database admin console:
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users
-- where lower(email) = 'agenciascase@gmail.com'
--   and email_confirmed_at is not null
-- on conflict do nothing;
-- Verify that exactly the intended user was assigned before granting access.
