-- Read-only campaign sharing. Never expose underlying campaign/account tables anonymously.
create extension if not exists pgcrypto;
create table if not exists public.campaign_share_links (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 campaign_key text not null,
 token_hash text not null unique,
 snapshot jsonb not null,
 expires_at timestamptz not null default (now()+interval '30 days'),
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.campaign_share_links enable row level security;
revoke all on public.campaign_share_links from anon, authenticated;
grant select on public.campaign_share_links to authenticated;
create policy "admins read their shares" on public.campaign_share_links for select to authenticated
using (owner_id=auth.uid() and exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin'));
create or replace function public.create_campaign_share(p_key text,p_snapshot jsonb)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare token text;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then
  raise exception 'Not authorized';
 end if;
 if length(p_key)<1 or length(p_key)>255 or jsonb_typeof(p_snapshot)<>'object' then
  raise exception 'Invalid campaign';
 end if;
 token:=encode(gen_random_bytes(32),'hex');
 insert into public.campaign_share_links(owner_id,campaign_key,token_hash,snapshot)
 values(auth.uid(),p_key,encode(digest(token,'sha256'),'hex'),p_snapshot);
 return token;
end $$;
create or replace function public.read_campaign_share(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]+$' then return null;end if;
 select snapshot into result from public.campaign_share_links
 where token_hash=encode(digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now();
 return result;
end $$;
create or replace function public.revoke_campaign_share(p_token text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then
  raise exception 'Not authorized';
 end if;
 update public.campaign_share_links set revoked_at=now()
 where token_hash=encode(digest(p_token,'sha256'),'hex') and owner_id=auth.uid() and revoked_at is null;
 return found;
end $$;
revoke all on function public.create_campaign_share(text,jsonb) from public;
revoke all on function public.read_campaign_share(text) from public;
revoke all on function public.revoke_campaign_share(text) from public;
grant execute on function public.create_campaign_share(text,jsonb) to authenticated;
grant execute on function public.read_campaign_share(text) to anon,authenticated;
grant execute on function public.revoke_campaign_share(text) to authenticated;
