-- =============================================================================
-- APENAS PARA TESTE LOCAL. Não faz parte da migração e não roda no Supabase.
--
-- Recria o mínimo do ambiente Supabase para que 0001_init.sql possa ser
-- aplicado num Postgres limpo: o schema `auth`, a função auth.uid() lendo o
-- claim do JWT como o Supabase faz, e os três papéis.
-- =============================================================================

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Igual ao Supabase: lê o sub do JWT injetado na sessão.
create or replace function auth.uid()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Atalho usado pelos testes para "logar" como alguém.
create or replace function auth.entrar_como(uid uuid)
returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  execute 'set local role authenticated';
end;
$$;
