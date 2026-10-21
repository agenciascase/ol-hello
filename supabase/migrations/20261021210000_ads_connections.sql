create table if not exists public.ads_connections (
 provider text not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 access_token_ciphertext text not null,
 refresh_token_ciphertext text,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(provider,owner_id),
 constraint ads_provider_check check(provider in ('google','meta'))
);
alter table public.ads_connections enable row level security;
revoke all on public.ads_connections from anon,authenticated;
-- Only backend service role can read credential records. No client RLS policies.
