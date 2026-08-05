-- =============================================================================
-- A conexão da conta Mercado Pago do guia
--
-- É por aqui que o guia autoriza a plataforma a cobrar em nome dele. O retorno
-- do Mercado Pago chega numa função do servidor (`mp-oauth`) que não tem sessão
-- de usuário nenhuma: quem volta é o navegador do guia, sem token do nosso
-- aplicativo. Por isso o vínculo entre "quem começou a conectar" e "quem está
-- voltando" precisa estar guardado no banco, num segredo de uso único.
--
-- DUAS COISAS QUE ESTE ARQUIVO CONSERTA E QUE NÃO SÃO SOBRE OAUTH:
--
-- 1. O guia podia se declarar conectado sozinho. `grant update` em `guides` é
--    de tabela inteira, e a política `guias_update_proprio` deixa ele editar a
--    própria linha — então um `PATCH /guides?id=eq.<dele>` com
--    `mp_conectado_em = now()` passava. Isso abre a porta da agenda (migração
--    0005) sem conta conectada: ele publica datas, o cliente reserva, e não
--    existe caminho de recebimento. Testado antes de escrever a correção.
--
-- 2. O guia podia escrever o próprio `mp_access_token`. Não vaza nada — o app
--    já não lê essas colunas —, mas deixa gravar credencial inventada no lugar
--    onde a plataforma vai buscar com quem cobrar.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. As colunas do Mercado Pago passam a ser escritas só pela plataforma
--
-- Trigger separada, e não mais um bloco dentro de
-- `guardar_campos_de_decisao_do_guia`, por causa de uma diferença real: aquela
-- libera o master logo no começo, e aqui **nem o master pode**. Ele não tem
-- como saber o token de ninguém, e marcar "conectado" na mão abriria a porta da
-- agenda sem caminho de recebimento.
--
-- Escrever a regra nos dois lugares seria manter duas cópias dela — e no dia em
-- que divergissem, a que sobra é a permissiva.
-- -----------------------------------------------------------------------------
-- O sinal de que quem está gravando é a plataforma, e não alguém mexendo na
-- própria linha. `auth.uid() is null` sozinho não serve aqui: as funções abaixo
-- rodam DENTRO da sessão do guia em alguns caminhos, e barrariam o próprio
-- caminho legítimo — foi o que aconteceu no primeiro teste desta migração.
--
-- É seguro porque `set_config` não é chamável pelo aplicativo: o PostgREST só
-- expõe função do schema `public`, e esta marca é posta e apagada dentro da
-- mesma transação, pelas duas funções que têm o direito de gravar.
create or replace function public.conexao_mp_so_pela_plataforma()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Migração, seed, psql, robô: não há sessão de usuário para barrar.
  if auth.uid() is null then
    return new;
  end if;

  -- A plataforma se identificou.
  if coalesce(current_setting('pv.conexao_mp', true), '') = 'on' then
    return new;
  end if;

  if new.mp_conectado_em  is distinct from old.mp_conectado_em
     or new.mp_user_id      is distinct from old.mp_user_id
     or new.mp_access_token is distinct from old.mp_access_token
     or new.mp_refresh_token is distinct from old.mp_refresh_token then
    raise exception 'A conexão com o Mercado Pago é gravada pela plataforma, ao voltar da autorização.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists conexao_mp_so_pela_plataforma on public.guides;
create trigger conexao_mp_so_pela_plataforma
  before update on public.guides
  for each row execute function public.conexao_mp_so_pela_plataforma();

-- E na entrada: um guia não nasce conectado.
create or replace function public.guia_nasce_desconectado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.mp_conectado_em  := null;
  new.mp_user_id       := null;
  new.mp_access_token  := null;
  new.mp_refresh_token := null;
  return new;
end;
$$;

drop trigger if exists guia_nasce_desconectado on public.guides;
create trigger guia_nasce_desconectado
  before insert on public.guides
  for each row execute function public.guia_nasce_desconectado();

-- Uma conta do Mercado Pago pertence a um guia só. Sem isto, dois cadastros
-- apontariam para a mesma conta — e um guia suspenso continuaria recebendo pelo
-- outro registro.
create unique index if not exists guides_mp_user_id_unico
  on public.guides (mp_user_id) where mp_user_id is not null;


-- -----------------------------------------------------------------------------
-- 2. O segredo de uso único que liga o "conectar" ao "voltou"
--
-- Sem ele, qualquer pessoa que descobrisse o endereço de retorno poderia mandar
-- um código do Mercado Pago e ficar com a conta pendurada num guia qualquer. O
-- `state` é o que prova que a volta pertence a quem começou.
-- -----------------------------------------------------------------------------
create table if not exists public.mp_conexoes (
  state      text primary key,
  guide_id   uuid not null references public.guides(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '15 minutes',
  usado_em   timestamptz
);

create index if not exists mp_conexoes_guide on public.mp_conexoes (guide_id);

alter table public.mp_conexoes enable row level security;

-- Nenhuma política, de propósito: só quem tem `service_role` ou passa pelas
-- funções abaixo encosta nesta tabela. O `state` é senha de uso único; ler a
-- tabela é poder concluir a conexão de outra pessoa.
revoke all on public.mp_conexoes from anon, authenticated;


-- -----------------------------------------------------------------------------
-- Começar a conectar: o aplicativo pede o segredo, e só então abre o navegador.
-- -----------------------------------------------------------------------------
create or replace function public.iniciar_conexao_mp()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_guia  public.guides;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_guia from public.guides where user_id = auth.uid();
  if not found then
    raise exception 'Só um guia cadastrado conecta conta de recebimento.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_guia.status <> 'aprovado' then
    raise exception 'Seu cadastro ainda está em análise. A conexão com o Mercado Pago vem depois da aprovação.'
      using errcode = 'check_violation';
  end if;

  -- Uma tentativa viva por vez. Segredo antigo que continua valendo é segredo a
  -- mais circulando, e não serve para nada: quem desistiu no meio recomeça.
  delete from public.mp_conexoes
   where guide_id = v_guia.id and usado_em is null;

  v_state := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.mp_conexoes (state, guide_id) values (v_state, v_guia.id);

  return v_state;
end;
$$;

revoke all on function public.iniciar_conexao_mp() from public, anon;
grant execute on function public.iniciar_conexao_mp() to authenticated;

comment on function public.iniciar_conexao_mp() is
  'Cria o segredo de uso único que o guia leva ao Mercado Pago. Resolve o guia por auth.uid().';


-- -----------------------------------------------------------------------------
-- Concluir: chamada pela função do servidor, com service_role, depois de trocar
-- o código pelo token.
--
-- A chave de cifra NÃO mora no banco. Ela chega por parâmetro, vinda do cofre
-- da função. Assim, uma cópia do banco sozinha não entrega token de guia
-- nenhum — e é justamente uma cópia do banco o que costuma vazar.
-- -----------------------------------------------------------------------------
create or replace function public.concluir_conexao_mp(
  p_state         text,
  p_mp_user_id    text,
  p_access_token  text,
  p_refresh_token text,
  p_chave         text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_conexao public.mp_conexoes;
begin
  if coalesce(p_chave, '') = '' then
    raise exception 'Falta a chave de cifra dos tokens.' using errcode = 'check_violation';
  end if;

  select * into v_conexao from public.mp_conexoes where state = p_state for update;
  if not found then
    raise exception 'Conexão não reconhecida.' using errcode = 'check_violation';
  end if;

  if v_conexao.usado_em is not null then
    raise exception 'Esta autorização já foi usada.' using errcode = 'check_violation';
  end if;

  if v_conexao.expira_em < now() then
    raise exception 'A autorização demorou demais. Comece de novo pelo aplicativo.'
      using errcode = 'check_violation';
  end if;

  update public.mp_conexoes set usado_em = now() where state = p_state;

  -- `true` = vale só nesta transação. Sem isso a marca vazaria para a próxima
  -- consulta da mesma conexão de banco, que o Supabase reaproveita entre
  -- requisições — e a próxima pessoa gravaria o que quisesse.
  perform set_config('pv.conexao_mp', 'on', true);

  update public.guides
     set mp_user_id       = p_mp_user_id,
         mp_access_token  = encode(extensions.pgp_sym_encrypt(p_access_token,  p_chave), 'base64'),
         mp_refresh_token = case when p_refresh_token is null then null
                            else encode(extensions.pgp_sym_encrypt(p_refresh_token, p_chave), 'base64') end,
         mp_conectado_em  = now()
   where id = v_conexao.guide_id;

  perform set_config('pv.conexao_mp', '', true);

  return v_conexao.guide_id;
end;
$$;

-- Só a função do servidor. `service_role` já tem tudo; aqui o que importa é
-- fechar para o resto do mundo.
revoke all on function public.concluir_conexao_mp(text, text, text, text, text)
  from public, anon, authenticated;

comment on function public.concluir_conexao_mp(text, text, text, text, text) is
  'Grava a conexão do guia depois da autorização. Só a Edge Function chama. A chave de cifra vem por parâmetro, nunca do banco.';


-- -----------------------------------------------------------------------------
-- Ler o token de volta, para cobrar em nome do guia.
--
-- Existe para que o token decifrado nunca precise sair do banco por uma consulta
-- comum — e para que a chave nunca seja gravada em lugar nenhum.
-- -----------------------------------------------------------------------------
create or replace function public.token_mp_do_guia(p_guide_id uuid, p_chave text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_cifrado text;
begin
  select mp_access_token into v_cifrado from public.guides where id = p_guide_id;
  if v_cifrado is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(decode(v_cifrado, 'base64'), p_chave);
end;
$$;

revoke all on function public.token_mp_do_guia(uuid, text)
  from public, anon, authenticated;

comment on function public.token_mp_do_guia(uuid, text) is
  'Devolve o access_token do guia decifrado. Só a Edge Function chama.';


-- -----------------------------------------------------------------------------
-- Desconectar. O guia pode desfazer o que autorizou — é conta dele.
--
-- Some o token, some a data, e a porta da agenda fecha de novo. As reservas já
-- fechadas continuam de pé: elas não dependem da conexão para existir, e apagar
-- a agenda futura é assunto do guia, não desta função.
-- -----------------------------------------------------------------------------
create or replace function public.desconectar_mp()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_guia public.guides;
begin
  if auth.uid() is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_guia from public.guides where user_id = auth.uid();
  if not found then
    raise exception 'Só um guia cadastrado desconecta conta de recebimento.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('pv.conexao_mp', 'on', true);

  update public.guides
     set mp_user_id = null, mp_access_token = null,
         mp_refresh_token = null, mp_conectado_em = null
   where id = v_guia.id;

  perform set_config('pv.conexao_mp', '', true);

  delete from public.mp_conexoes where guide_id = v_guia.id;
end;
$$;

revoke all on function public.desconectar_mp() from public, anon;
grant execute on function public.desconectar_mp() to authenticated;


-- -----------------------------------------------------------------------------
-- Limpeza dos segredos vencidos. Chamada pelo robô 9, junto com as reservas.
-- -----------------------------------------------------------------------------
create or replace function public.limpar_conexoes_mp()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from public.mp_conexoes
   where (usado_em is null and expira_em < now())
      or (usado_em is not null and usado_em < now() - interval '30 days');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.limpar_conexoes_mp() from public, anon, authenticated;
