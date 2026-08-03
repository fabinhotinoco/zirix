-- =============================================================================
-- Cria uma conta de acesso direto no banco, sem passar por e-mail.
--
-- POR QUE ISTO EXISTE: o envio de e-mail do projeto está devolvendo HTTP 500,
-- e essa configuração vive no painel do Supabase, fora do repositório. Sem um
-- caminho alternativo, ninguém entra no aplicativo — nem para testar o resto.
--
-- A conta nasce com o e-mail JÁ CONFIRMADO e com senha, de modo que a entrada
-- não dispara e-mail nenhum.
--
-- O QUE ESTE ARQUIVO NÃO FAZ: não cria perfil nem grava aceites. Isso continua
-- sendo trabalho do aplicativo, na tela de cadastro — é justamente o fluxo que
-- precisa ser testado, e falsificá-lo aqui tiraria o sentido do teste.
--
-- Parâmetros (psql -v):
--   email  endereço de acesso
--   senha  no mínimo 8 caracteres
--
-- Repetível: se a conta já existir, apenas troca a senha e reconfirma o e-mail.
-- =============================================================================

\set ON_ERROR_STOP on

-- As variáveis do psql não são substituídas dentro de um bloco entre $$: ali
-- o texto vai cru para o servidor. Passá-las por set_config resolve, e de
-- quebra a senha não fica escrita no corpo do comando.
select
  set_config('pv.email', :'email', false),
  set_config('pv.senha', :'senha', false)
\gset

do $$
declare
  v_email text := lower(btrim(current_setting('pv.email')));
  v_senha text := current_setting('pv.senha');
  v_id    uuid;
  v_hash  text;
  v_novo  boolean;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido: %', v_email;
  end if;

  if length(v_senha) < 8 then
    raise exception 'A senha precisa de pelo menos 8 caracteres (recebi %).', length(v_senha);
  end if;

  -- O GoTrue usa bcrypt. pgcrypto vive no schema `extensions` no Supabase, mas
  -- em Postgres comum fica no `public` — procurar nos dois deixa o arquivo
  -- utilizável também no banco descartável dos testes.
  perform set_config('search_path', 'auth, extensions, public, pg_temp', true);
  v_hash := crypt(v_senha, gen_salt('bf'));

  select id into v_id from auth.users where email = v_email;
  v_novo := v_id is null;

  if v_novo then
    v_id := gen_random_uuid();

    -- As colunas de token são NOT NULL em várias versões do GoTrue e ele não
    -- lida bem com NULL nelas: string vazia é o valor que o próprio serviço
    -- grava quando não há token pendente.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, v_hash,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', ''
    );

    -- Sem a identidade correspondente, o login por senha é recusado: o GoTrue
    -- procura o provedor `email` aqui, não em auth.users.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) then
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    else
      insert into auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    raise notice 'Conta criada para % (id %)', v_email, v_id;
  else
    update auth.users
       set encrypted_password = v_hash,
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_id;

    raise notice 'Conta já existia: senha trocada e e-mail confirmado para %', v_email;
  end if;
end $$;

select
  email,
  (email_confirmed_at is not null)                          as email_confirmado,
  (encrypted_password is not null and encrypted_password <> '') as tem_senha,
  (select count(*) from auth.identities i where i.user_id = u.id) as identidades
from auth.users u
where email = lower(btrim(current_setting('pv.email')));
