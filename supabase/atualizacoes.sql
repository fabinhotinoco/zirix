-- =============================================================================
-- ATUALIZAÇÕES — para um banco que já existe e já tem dados.
--
-- Aplica o que veio depois da criação inicial. Pode rodar quantas vezes quiser:
-- tudo aqui é escrito para ser repetível.
--
-- GERADO AUTOMATICAMENTE por tools/build-setup-sql.mjs — não edite.
-- =============================================================================

-- ===== supabase/migrations/0002_ip_do_aceite.sql =====
-- =============================================================================
-- IP e user-agent do aceite, preenchidos pelo servidor
--
-- A tabela terms_acceptances já previa as colunas `ip` e `user_agent`, mas nada
-- as preenchia: o aplicativo insere direto na tabela, e o aplicativo não sabe o
-- próprio IP público. Resultado: todos os aceites gravados até aqui têm ip nulo.
--
-- Também não adiantaria o aplicativo informar: valor declarado por quem assina
-- não prova nada. Tem que vir do servidor.
--
-- O PostgREST expõe os cabeçalhos da requisição em `request.headers`. Daí sai o
-- endereço de quem chamou, sem Edge Function nenhuma.
--
-- LIMITE HONESTO: `x-forwarded-for` é um cabeçalho, e quem controla o cliente
-- pode forjá-lo. O que se ganha aqui é corroboração — o registro concorda com o
-- que a infraestrutura viu —, não prova irrefutável de origem. Para o uso
-- pretendido (demonstrar boa-fé no registro do aceite) isso é o padrão de
-- mercado; para uma disputa onde a origem seja o ponto central, o log do
-- provedor é a fonte melhor.
--
-- Idempotente: pode ser aplicado quantas vezes for.
-- =============================================================================

create or replace function public.preencher_origem_do_aceite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cabecalhos json;
  encaminhado text;
  candidato text;
begin
  -- Fora de uma requisição do PostgREST (psql, job, teste) não há cabeçalho
  -- nenhum; nesse caso o que o chamador informou é o que fica.
  begin
    cabecalhos := current_setting('request.headers', true)::json;
  exception when others then
    cabecalhos := null;
  end;

  if cabecalhos is null then
    return new;
  end if;

  -- cf-connecting-ip, quando existe, já vem com um endereço só e é posto pela
  -- borda. x-forwarded-for pode trazer uma lista "cliente, proxy1, proxy2";
  -- o primeiro item é o cliente original.
  candidato := cabecalhos ->> 'cf-connecting-ip';

  if candidato is null then
    encaminhado := cabecalhos ->> 'x-forwarded-for';
    if encaminhado is not null then
      candidato := btrim(split_part(encaminhado, ',', 1));
    end if;
  end if;

  if candidato is not null and candidato <> '' then
    -- Endereço malformado não pode derrubar o cadastro inteiro: o aceite vale
    -- mais que o IP.
    begin
      new.ip := candidato::inet;
    exception when others then
      null;
    end;
  end if;

  -- O user-agent real do navegador/aplicativo prevalece sobre o que o cliente
  -- tenha mandado no corpo.
  candidato := cabecalhos ->> 'user-agent';
  if candidato is not null and candidato <> '' then
    new.user_agent := candidato;
  end if;

  return new;
end;
$$;

drop trigger if exists preencher_origem_do_aceite on public.terms_acceptances;

create trigger preencher_origem_do_aceite
  before insert on public.terms_acceptances
  for each row execute function public.preencher_origem_do_aceite();


-- ===== supabase/migrations/0003_guia_nao_se_aprova.sql =====
-- =============================================================================
-- O guia não pode aprovar a si mesmo nem mexer na própria comissão
--
-- A política de atualização da tabela `guides` permite que o dono altere a
-- própria linha — o que é correto para nome da operação, cidade, bio e foto.
-- Só que RLS decide por LINHA, não por coluna: com a mesma permissão, um guia
-- pendente podia rodar
--
--   update guides set status = 'aprovado', comissao_percentual = 0
--   where user_id = auth.uid();
--
-- e entrar na plataforma aprovado, sem comissão nenhuma. Não precisaria nem do
-- aplicativo: a chave publicável e um `curl` bastam.
--
-- Um gatilho resolve o que a política não alcança, porque ele enxerga coluna
-- por coluna. Os campos de decisão do administrador ficam trancados para todo
-- mundo que não seja o master.
--
-- Idempotente.
-- =============================================================================

create or replace function public.guardar_campos_de_decisao_do_guia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fora de uma sessão de usuário (psql, migração, Edge Function com
  -- service_role) não há quem barrar. Sem esta saída, o próprio semeador do
  -- banco tem os valores reescritos em silêncio: um guia inserido como
  -- 'aprovado' vira 'pendente' e a comissão combinada vira nula, sem erro
  -- nenhum. Foi assim que o teste da porta da agenda quebrou.
  if auth.uid() is null then
    return new;
  end if;

  -- O master decide; qualquer outra pessoa só edita a própria apresentação.
  if public.is_master() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Só o administrador da plataforma altera o status do guia.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.comissao_percentual is distinct from old.comissao_percentual then
    raise exception 'Só o administrador da plataforma altera a comissão.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.aprovado_por is distinct from old.aprovado_por
     or new.aprovado_em is distinct from old.aprovado_em then
    raise exception 'O registro da aprovação é gravado pela plataforma.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists guardar_campos_de_decisao_do_guia on public.guides;

create trigger guardar_campos_de_decisao_do_guia
  before update on public.guides
  for each row execute function public.guardar_campos_de_decisao_do_guia();

-- Um guia recém-inscrito também não pode nascer aprovado: o insert é feito pelo
-- próprio usuário, então os mesmos campos precisam ser forçados na entrada.
create or replace function public.guia_nasce_pendente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fora de uma sessão de usuário (psql, migração, Edge Function com
  -- service_role) não há quem barrar. Sem esta saída, o próprio semeador do
  -- banco tem os valores reescritos em silêncio: um guia inserido como
  -- 'aprovado' vira 'pendente' e a comissão combinada vira nula, sem erro
  -- nenhum. Foi assim que o teste da porta da agenda quebrou.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_master() then
    return new;
  end if;

  new.status              := 'pendente';
  new.comissao_percentual := null;   -- null = usa o padrão da plataforma
  new.aprovado_por        := null;
  new.aprovado_em         := null;
  return new;
end;
$$;

drop trigger if exists guia_nasce_pendente on public.guides;

create trigger guia_nasce_pendente
  before insert on public.guides
  for each row execute function public.guia_nasce_pendente();


-- ===== supabase/migrations/0004_fechar_execute_das_funcoes.sql =====
-- =============================================================================
-- Fecha a execução das funções privilegiadas
--
-- O Postgres concede EXECUTE a PUBLIC em toda função nova, e o Supabase publica
-- o schema `public` como API REST. Junto, isso significa que cada função deste
-- projeto virou um endereço chamável — inclusive sem login, em
-- /rest/v1/rpc/<nome>. Nenhuma delas foi feita para isso.
--
-- O caso com dano concreto é `is_diamond(uuid)`: ela aceita o identificador de
-- outra pessoa. Aberta ao papel anônimo, qualquer um podia perguntar "fulano é
-- assinante Diamond?" e receber a resposta — sobre quem paga, sem estar logado.
--
-- O que cada grupo precisa, e por quê:
--
--   gatilhos          ninguém precisa chamar. O Postgres não exige EXECUTE do
--                     usuário para disparar um gatilho — quem dispara é a
--                     tabela. Revogar de todos não quebra nada.
--
--   is_master         usadas DENTRO das políticas de RLS, que são avaliadas com
--   is_guide_owner    o papel de quem consulta. Aqui o EXECUTE é necessário
--                     para `authenticated`, senão toda consulta passa a falhar
--                     com "permission denied for function". Fecha só para o
--                     anônimo.
--
--   is_diamond        chamada dentro de v_catches_feed. Uma view SECURITY
--                     DEFINER empresta a permissão das TABELAS, mas não a de
--                     FUNÇÃO: essa continua sendo checada contra quem consulta.
--                     Fechá-la para `authenticated` derruba o feed inteiro —
--                     confirmado pelo teste, que quebrou na primeira tentativa
--                     com "permission denied for function is_diamond".
--
--                     Então o vazamento é fechado por dentro: a função passa a
--                     responder só sobre quem pergunta. Perguntar por outra
--                     pessoa devolve falso, e não a verdade sobre a assinatura
--                     dela. O master continua enxergando tudo, porque precisa
--                     para gerir os membros.
--
-- Idempotente.
-- =============================================================================

-- --- Funções de gatilho: fechadas para todo mundo ----------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- --- Auxiliares de política: fechadas para o anônimo -------------------------
revoke all on function public.is_master()             from public, anon;
revoke all on function public.is_guide_owner(uuid)    from public, anon;
grant execute on function public.is_master()          to authenticated;
grant execute on function public.is_guide_owner(uuid) to authenticated;

-- --- is_diamond: fechada para o anônimo e sem responder sobre terceiros ------
create or replace function public.is_diamond(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid
      and plano = 'diamond'
      and status = 'ativa'
      and fim >= current_date
  )
  -- A pergunta só é respondida sobre quem pergunta. Sem esta linha, qualquer
  -- pessoa logada descobre pelo endereço /rest/v1/rpc/is_diamond quem são os
  -- assinantes — informação sobre quem paga.
  and (uid = auth.uid() or public.is_master());
$$;

revoke all on function public.is_diamond(uuid) from public, anon;
grant execute on function public.is_diamond(uuid) to authenticated;

-- --- Daqui para frente, função nova não nasce aberta -------------------------
-- Sem isto, a próxima função criada repete o problema em silêncio.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;


-- ===== supabase/migrations/0005_porta_de_entrada_da_agenda.sql =====
-- =============================================================================
-- Agenda só de guia aprovado e com Mercado Pago conectado
--
-- A regra está no planejamento desde o começo ("guia sem Mercado Pago conectado
-- não consegue publicar agenda"), mas não existia no banco. Sem ela, dois
-- estados ruins eram alcançáveis:
--
--   1. Guia ainda pendente abrindo datas. A aprovação viraria enfeite.
--   2. Guia aprovado, mas sem conta de recebimento conectada, abrindo datas.
--      Um cliente reservaria e pagaria sem que existisse caminho para o dinheiro
--      chegar ao guia — e o problema só apareceria no pagamento, com o cliente
--      no meio.
--
-- Melhor recusar na abertura da data do que descobrir na hora de receber.
--
-- Fica no banco, e não na tela, porque a tela é apenas uma das formas de chegar
-- na tabela: a chave publicável e um `curl` são outra.
--
-- Idempotente.
-- =============================================================================

create or replace function public.exigir_guia_pronto_para_agenda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g record;
begin
  -- Fora de uma sessão de usuário (psql, migração, Edge Function com
  -- service_role) não há quem barrar: a porta é para quem chega pela API com
  -- um login, que é por onde um guia chegaria.
  if auth.uid() is null then
    return new;
  end if;

  -- O master administra: pode ajustar a agenda de qualquer guia, inclusive para
  -- corrigir um erro. A porta é para o guia, não para quem opera a plataforma.
  if public.is_master() then
    return new;
  end if;

  select gu.status, gu.mp_conectado_em, gu.nome_operacao
    into g
    from public.boats b
    join public.guides gu on gu.id = b.guide_id
   where b.id = new.boat_id;

  if g is null then
    raise exception 'Barco inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if g.status <> 'aprovado' then
    raise exception
      'A operação % ainda não foi aprovada pela plataforma; não é possível abrir datas.',
      g.nome_operacao
      using errcode = 'insufficient_privilege';
  end if;

  if g.mp_conectado_em is null then
    raise exception
      'Conecte sua conta do Mercado Pago antes de abrir datas: sem ela não há como você receber.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.exigir_guia_pronto_para_agenda() from public, anon, authenticated;

drop trigger if exists exigir_guia_pronto_para_agenda on public.boat_availability;

create trigger exigir_guia_pronto_para_agenda
  before insert or update on public.boat_availability
  for each row execute function public.exigir_guia_pronto_para_agenda();

-- =============================================================================
-- A agenda também não pode ser lida por qualquer um
--
-- A política de leitura era `using (true)`: qualquer pessoa logada enxergava a
-- agenda e os preços de todos os barcos, inclusive de operações pendentes ou
-- suspensas. Preço de guia que ainda não entrou na plataforma não é informação
-- pública, e agenda de operação suspensa não deve aparecer para ninguém.
-- =============================================================================

drop policy if exists agenda_leitura on public.boat_availability;

create policy agenda_leitura on public.boat_availability
  for select to authenticated
  using (
    exists (
      select 1
        from public.boats b
        join public.guides g on g.id = b.guide_id
       where b.id = boat_availability.boat_id
         and b.status = 'ativo'
         and g.status = 'aprovado'
    )
    or exists (
      select 1 from public.boats b
       where b.id = boat_availability.boat_id
         and public.is_guide_owner(b.guide_id)
    )
    or public.is_master()
  );


-- ===== supabase/migrations/0006_criar_reserva.sql =====
-- =============================================================================
-- criar_reserva: a reserva nasce no servidor, nunca no aplicativo
--
-- POR QUE ISTO É UMA FUNÇÃO, E NÃO UM INSERT DO APLICATIVO:
--
-- Quem informa o preço não pode ser quem paga. Se o aplicativo enviasse o valor,
-- bastaria um `curl` com a chave publicável para reservar um passeio de mil
-- reais por um centavo — e a política de RLS não teria como saber que o número
-- está errado, porque para ela é só uma coluna.
--
-- Então o cliente envia apenas O QUE quer (barco, data, quantas pessoas) e o
-- servidor decide QUANTO custa, lendo o preço da agenda e a comissão da cascata.
--
-- Roda como SECURITY DEFINER porque precisa ler `guides` e `app_settings`, que
-- o cliente não alcança. Em troca, valida tudo por conta própria: identidade,
-- capacidade do barco, data aberta e no futuro, e caminho de recebimento.
--
-- A trava contra reserva dupla é o índice único parcial de `bookings`
-- (boat_id, data) para status ativo, criado em 0001. Dois clientes clicando ao
-- mesmo tempo: um ganha, o outro recebe erro claro em vez de uma segunda
-- reserva do mesmo barco no mesmo dia.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Qual texto está valendo agora.
--
-- "Versão vigente" é a mais recente cujo início já passou — publicar um texto
-- com data futura não pode reger uma reserva feita hoje.
-- -----------------------------------------------------------------------------
create or replace function public.documento_vigente(p_slug text)
returns public.legal_documents
language sql
stable
set search_path = public, pg_temp
as $$
  select *
    from public.legal_documents
   where slug = p_slug
     and vigente_desde <= now()
   order by vigente_desde desc
   limit 1;
$$;

revoke all on function public.documento_vigente(text) from public, anon;
grant execute on function public.documento_vigente(text) to authenticated;

comment on function public.documento_vigente(text) is
  'Versão em vigor de um documento legal. Texto publicado com data futura não rege reserva de hoje.';


create or replace function public.criar_reserva(
  p_boat_id          uuid,
  p_data             date,
  p_qtd_pescadores   integer,
  p_participantes    jsonb    default '[]'::jsonb,
  p_aceitou_politica boolean  default false,
  p_aceitou_termo    boolean  default false
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user            uuid := auth.uid();
  v_dia             record;
  v_barco           record;
  v_guia            record;
  v_politica        public.legal_documents;
  v_termo           public.legal_documents;
  v_comissao        numeric(5,2);
  v_sinal_pct       numeric(5,2);
  v_prazo_dias      integer;
  v_expira_min      integer;
  v_desconto_pct    numeric(5,2) := 0;
  v_total           integer;
  v_desconto        integer;
  v_liquido         integer;
  v_comissao_cent   integer;
  v_sinal           integer;
  v_reserva         public.bookings;
  v_participante    jsonb;
  v_nome            text;
begin
  if v_user is null then
    raise exception 'Faça login para reservar.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Conclua seu cadastro antes de reservar.' using errcode = 'check_violation';
  end if;

  if p_qtd_pescadores is null or p_qtd_pescadores < 1 then
    raise exception 'Informe quantos pescadores vão.' using errcode = 'check_violation';
  end if;

  if p_data is null or p_data <= current_date then
    raise exception 'A data da pescaria precisa ser no futuro.' using errcode = 'check_violation';
  end if;

  -- Preço vem da agenda, não do aplicativo.
  select * into v_dia
    from public.boat_availability
   where boat_id = p_boat_id and data = p_data;

  if not found or v_dia.status <> 'aberto' then
    raise exception 'Esta data não está aberta para este barco.' using errcode = 'check_violation';
  end if;

  select * into v_barco from public.boats where id = p_boat_id;
  if not found then
    raise exception 'Barco não encontrado.' using errcode = 'check_violation';
  end if;

  select * into v_guia from public.guides where id = v_barco.guide_id;
  if not found then
    raise exception 'Barco não encontrado.' using errcode = 'check_violation';
  end if;

  if v_barco.status <> 'ativo' or v_guia.status <> 'aprovado' then
    raise exception 'Este barco não está disponível para reserva.' using errcode = 'check_violation';
  end if;

  -- A mesma porta que impede abrir data sem Mercado Pago (migração 0005), agora
  -- do lado de quem paga: um guia que desconectou a conta depois de abrir a
  -- agenda deixaria a reserva sem caminho para o dinheiro chegar até ele.
  if v_guia.mp_conectado_em is null then
    raise exception 'Este guia ainda não está pronto para receber pagamentos.'
      using errcode = 'check_violation';
  end if;

  if p_qtd_pescadores < v_barco.capacidade_min or p_qtd_pescadores > v_barco.capacidade_max then
    raise exception 'Este barco leva de % a % pescadores.',
      v_barco.capacidade_min, v_barco.capacidade_max using errcode = 'check_violation';
  end if;

  -- Os dois documentos que regem ESTA reserva. O aceite é por pescaria, não só
  -- no cadastro: é o aceite da pescaria que tem valor probatório quando alguém
  -- cancela e discorda da retenção.
  v_politica := public.documento_vigente('politica_cancelamento');
  v_termo    := public.documento_vigente('termo_responsabilidade');

  if v_politica.id is null or v_termo.id is null then
    raise exception 'Documentos legais não publicados. Avise o administrador.';
  end if;
  if not p_aceitou_politica or not p_aceitou_termo then
    raise exception 'É preciso aceitar a política de cancelamento e o termo de responsabilidade.'
      using errcode = 'check_violation';
  end if;

  -- Cascata da comissão: barco vence guia, guia vence o padrão da plataforma.
  -- `coalesce` respeita o zero — um guia isento tem comissão 0, não "sem valor".
  v_comissao := coalesce(
    v_barco.comissao_percentual,
    v_guia.comissao_percentual,
    (select (valor #>> '{}')::numeric from public.app_settings
      where chave = 'comissao_padrao_percentual')
  );
  if v_comissao is null then
    raise exception 'Comissão padrão da plataforma não configurada.';
  end if;

  v_sinal_pct := coalesce(
    v_guia.sinal_percentual,
    (select (valor #>> '{}')::numeric from public.app_settings
      where chave = 'sinal_percentual_padrao'));
  if v_sinal_pct is null then
    raise exception 'Percentual de sinal não configurado.';
  end if;

  v_prazo_dias := coalesce(
    v_guia.prazo_quitacao_dias,
    (select (valor #>> '{}')::integer from public.app_settings
      where chave = 'prazo_quitacao_dias'), 7);

  v_expira_min := coalesce(
    (select (valor #>> '{}')::integer from public.app_settings
      where chave = 'reserva_expira_minutos'), 20);

  -- Desconto Diamond: só se o guia oferecer E o cliente for assinante ativo.
  -- Sai da parte do guia, por isso entra antes do cálculo da comissão.
  if v_guia.oferece_desconto_diamond and public.is_diamond(v_user) then
    v_desconto_pct := v_guia.desconto_diamond_percentual;
  end if;

  v_total    := v_dia.preco_barco_centavos
              + v_dia.preco_passageiro_centavos * p_qtd_pescadores;
  v_desconto := round(v_total * v_desconto_pct / 100.0);
  v_liquido  := v_total - v_desconto;

  v_comissao_cent := round(v_liquido * v_comissao / 100.0);
  v_sinal         := round(v_liquido * v_sinal_pct / 100.0);

  insert into public.bookings (
    user_id, guide_id, boat_id, data, qtd_pescadores,
    preco_barco_centavos, preco_passageiro_centavos,
    valor_total_centavos, desconto_centavos,
    comissao_percentual, comissao_centavos, repasse_guia_centavos,
    sinal_centavos, saldo_centavos,
    status, status_pagamento,
    quitacao_vence_em, expira_em,
    termo_versao, politica_versao
  ) values (
    v_user, v_guia.id, p_boat_id, p_data, p_qtd_pescadores,
    v_dia.preco_barco_centavos, v_dia.preco_passageiro_centavos,
    v_total, v_desconto,
    v_comissao, v_comissao_cent, v_liquido - v_comissao_cent,
    v_sinal, v_liquido - v_sinal,
    'pendente', 'aguardando_sinal',
    p_data - v_prazo_dias, now() + make_interval(mins => v_expira_min),
    v_termo.versao, v_politica.versao
  )
  returning * into v_reserva;

  -- O aceite fica gravado com a versão E o hash do corpo. A versão sozinha não
  -- prova nada: o texto pode ter sido editado depois. O gatilho de 0002
  -- completa IP e aparelho a partir dos cabeçalhos da requisição.
  insert into public.terms_acceptances (user_id, booking_id, documento_slug, versao, hash_sha256)
  values (v_user, v_reserva.id, 'politica_cancelamento', v_politica.versao, v_politica.hash_sha256),
         (v_user, v_reserva.id, 'termo_responsabilidade', v_termo.versao, v_termo.hash_sha256);

  -- Participantes são terceiros cadastrados por outra pessoa (LGPD): o contrato
  -- do cliente diz que ele declara ter autorização de cada um.
  if jsonb_typeof(coalesce(p_participantes, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de participantes inválida.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(p_participantes, '[]'::jsonb)) > p_qtd_pescadores then
    raise exception 'Você listou mais gente do que os % lugares reservados.', p_qtd_pescadores
      using errcode = 'check_violation';
  end if;

  for v_participante in
    select * from jsonb_array_elements(coalesce(p_participantes, '[]'::jsonb))
  loop
    v_nome := btrim(coalesce(v_participante ->> 'nome', ''));
    if v_nome = '' then
      raise exception 'Todo participante precisa de nome.' using errcode = 'check_violation';
    end if;
    insert into public.booking_participants (booking_id, nome, telefone)
    values (v_reserva.id, v_nome, nullif(btrim(coalesce(v_participante ->> 'telefone', '')), ''));
  end loop;

  return v_reserva;

exception
  when unique_violation then
    -- O índice único parcial de bookings. Acontece de verdade quando dois
    -- clientes confirmam no mesmo segundo.
    raise exception 'Esta data acabou de ser reservada por outra pessoa.'
      using errcode = 'unique_violation';
end;
$$;

revoke all on function public.criar_reserva(uuid, date, integer, jsonb, boolean, boolean)
  from public, anon;
grant execute on function public.criar_reserva(uuid, date, integer, jsonb, boolean, boolean)
  to authenticated;

comment on function public.criar_reserva(uuid, date, integer, jsonb, boolean, boolean) is
  'Cria a reserva calculando preço e comissão no servidor. O aplicativo informa o que quer, nunca quanto custa.';

-- A assinatura antiga, sem os aceites, ficaria conviver com a nova e poderia
-- ser chamada por engano — criando reserva sem documento aceito.
drop function if exists public.criar_reserva(uuid, date, integer, jsonb);


