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

  -- Reserva não paga que passou da hora não segura mais a data. Varrer aqui,
  -- e não só num agendador, é o que impede que uma falha do robô deixe datas
  -- presas: quem chega para reservar limpa o próprio dia antes de tentar.
  update public.bookings
     set status = 'expirada'
   where boat_id = p_boat_id
     and data    = p_data
     and status  = 'pendente'
     and status_pagamento = 'aguardando_sinal'
     and expira_em is not null
     and expira_em < now();

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


-- ===== supabase/migrations/0007_agenda_do_cliente.sql =====
-- =============================================================================
-- O lado do cliente: quais datas estão livres, quais reservas são minhas,
-- e como desistir de uma que ainda não foi paga.
--
-- POR QUE PRECISA DE FUNÇÃO, E NÃO DÁ PARA LER AS TABELAS DIRETO:
--
-- O cliente não enxerga a reserva de outra pessoa — e é assim que tem de ser.
-- Só que "esta data está ocupada" é exatamente uma informação sobre a reserva
-- alheia. Sem estas funções, o aplicativo ofereceria datas já vendidas e a
-- pessoa só descobriria no erro, depois de escolher os acompanhantes.
--
-- As funções devolvem o mínimo: que o dia está tomado, nunca por quem.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reserva não paga que passou da hora deixa de segurar a data.
--
-- Fica aqui, e não só num agendador, porque a correção não pode depender de um
-- robô ter rodado: quem for reservar varre primeiro o próprio dia. O agendador
-- (robô 8) continua existindo para limpar o resto, mas se ele falhar por uma
-- semana nada fica preso.
-- -----------------------------------------------------------------------------
create or replace function public.expirar_reservas(p_boat_id uuid default null, p_data date default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.bookings
     set status = 'expirada'
   where status = 'pendente'
     and status_pagamento = 'aguardando_sinal'
     and expira_em is not null
     and expira_em < now()
     and (p_boat_id is null or boat_id = p_boat_id)
     and (p_data    is null or data    = p_data);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Varrer a base inteira é tarefa de manutenção, não de aplicativo.
revoke all on function public.expirar_reservas(uuid, date) from public, anon, authenticated;

comment on function public.expirar_reservas(uuid, date) is
  'Libera datas seguras por reserva não paga que já venceu. Sem argumento, varre tudo.';


-- -----------------------------------------------------------------------------
-- Datas que o cliente pode realmente reservar neste barco.
-- -----------------------------------------------------------------------------
create or replace function public.datas_disponiveis(p_boat_id uuid)
returns table (
  data                      date,
  preco_barco_centavos      integer,
  preco_passageiro_centavos integer,
  observacao                text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.data, a.preco_barco_centavos, a.preco_passageiro_centavos, a.observacao
    from public.boat_availability a
    join public.boats  b on b.id = a.boat_id
    join public.guides g on g.id = b.guide_id
   where a.boat_id = p_boat_id
     and a.status  = 'aberto'
     and a.data    > current_date
     and b.status  = 'ativo'
     and g.status  = 'aprovado'
     and g.mp_conectado_em is not null
     -- Ocupada é a que está confirmada, ou pendente cujo prazo de pagamento
     -- ainda não estourou. É a mesma condição do índice único de 0001, mais o
     -- vencimento — senão uma reserva abandonada esconderia a data para sempre.
     and not exists (
       select 1 from public.bookings r
        where r.boat_id = a.boat_id
          and r.data    = a.data
          and (r.status = 'confirmada'
               or (r.status = 'pendente'
                   and (r.expira_em is null or r.expira_em > now()))))
   order by a.data;
$$;

revoke all on function public.datas_disponiveis(uuid) from public, anon;
grant execute on function public.datas_disponiveis(uuid) to authenticated;

comment on function public.datas_disponiveis(uuid) is
  'Datas livres de um barco. Diz que o dia está tomado, nunca por quem.';


-- -----------------------------------------------------------------------------
-- Minhas reservas, já com o nome do guia e do barco.
--
-- Vem de função porque o cliente perde o acesso ao barco assim que o guia o
-- desativa — e a reserva dele não pode virar uma linha sem nome por causa
-- disso.
-- -----------------------------------------------------------------------------
create or replace function public.minhas_reservas()
returns table (
  id                   uuid,
  codigo               text,
  data                 date,
  qtd_pescadores       integer,
  valor_total_centavos integer,
  desconto_centavos    integer,
  sinal_centavos       integer,
  saldo_centavos       integer,
  status               text,
  status_pagamento     text,
  quitacao_vence_em    date,
  expira_em            timestamptz,
  guia_nome            text,
  guia_cidade          text,
  barco_nome           text,
  participantes        jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.codigo, r.data, r.qtd_pescadores,
         r.valor_total_centavos, r.desconto_centavos,
         r.sinal_centavos, r.saldo_centavos,
         r.status, r.status_pagamento, r.quitacao_vence_em, r.expira_em,
         g.nome_operacao, g.cidade, b.nome,
         coalesce(
           (select jsonb_agg(jsonb_build_object('nome', p.nome, 'telefone', p.telefone)
                             order by p.nome)
              from public.booking_participants p where p.booking_id = r.id),
           '[]'::jsonb)
    from public.bookings r
    join public.guides g on g.id = r.guide_id
    join public.boats  b on b.id = r.boat_id
   where r.user_id = auth.uid()
   order by r.data desc;
$$;

revoke all on function public.minhas_reservas() from public, anon;
grant execute on function public.minhas_reservas() to authenticated;

comment on function public.minhas_reservas() is
  'Reservas de quem está pedindo, com nome do guia e do barco. Filtra por auth.uid() por dentro.';


-- -----------------------------------------------------------------------------
-- Desistir de uma reserva que ainda não foi paga.
--
-- Só isso, de propósito. Cancelamento com dinheiro dentro é o motor de
-- retenção — faixas, devolução por revenda, arrependimento de sete dias — e
-- ele entra junto com o pagamento, porque depende do estorno. Enquanto não
-- existir, esta função recusa em voz alta em vez de cancelar sem devolver.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_reserva(p_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_reserva public.bookings;
begin
  if v_user is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_reserva from public.bookings where id = p_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'check_violation';
  end if;

  -- O guia também pode desistir de uma reserva não paga: é a recusa dele.
  if v_reserva.user_id <> v_user
     and not public.is_guide_owner(v_reserva.guide_id)
     and not public.is_master() then
    raise exception 'Esta reserva não é sua.' using errcode = 'insufficient_privilege';
  end if;

  if v_reserva.status in ('cancelada', 'expirada') then
    return v_reserva;  -- já estava desfeita; repetir não é erro
  end if;

  if v_reserva.status_pagamento <> 'aguardando_sinal' then
    raise exception 'Esta reserva já tem pagamento. O cancelamento com devolução entra junto com a etapa de pagamento.'
      using errcode = 'check_violation';
  end if;

  update public.bookings
     set status = 'cancelada', cancelada_em = now()
   where id = p_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

revoke all on function public.cancelar_reserva(uuid) from public, anon;
grant execute on function public.cancelar_reserva(uuid) to authenticated;

comment on function public.cancelar_reserva(uuid) is
  'Desfaz reserva ainda não paga. Reserva com dinheiro dentro é recusada até o motor de retenção existir.';


-- ===== supabase/migrations/0008_avisos_e_agenda_do_guia.sql =====
-- =============================================================================
-- Avisos automáticos e a agenda consolidada do guia
--
-- POR QUE O AVISO NASCE NO BANCO, E NÃO NO APLICATIVO:
--
-- Quem avisa não pode ser quem está com o aplicativo aberto. A reserva pode
-- ser criada às três da manhã, o pagamento pode ser confirmado por um webhook,
-- e a data pode expirar sozinha — em nenhum desses momentos existe uma tela
-- ligada para disparar nada. O gatilho aqui dispara junto com o fato, sempre.
--
-- Push, SMS e e-mail entram na etapa de notificações e vão apenas ENTREGAR
-- estes mesmos avisos. Se o texto fosse montado na hora do envio, cada canal
-- inventaria o seu, e o que o cliente lê no aplicativo não bateria com o que
-- chega no celular.
--
-- Os valores vão CONGELADOS na linha do aviso, de propósito. Um extrato mostra
-- o presente; um aviso é registro do passado. Se ele lesse o saldo de hoje,
-- reescreveria o que a pessoa foi avisada mês passado.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dinheiro em texto, do jeito brasileiro.
--
-- O padrão ',' e '.' do to_char é fixo (o que varia com o idioma do servidor é
-- 'G' e 'D'). Assim o valor sai igual em qualquer máquina, e a troca no fim
-- inverte para 1.234,56.
-- -----------------------------------------------------------------------------
create or replace function public.brl(p_centavos integer)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p_centavos is null then null else
    'R$ ' || replace(replace(replace(
      to_char(p_centavos / 100.0, 'FM999,999,990.00'),
    ',', '#'), '.', ','), '#', '.')
  end;
$$;

revoke all on function public.brl(integer) from public, anon;
grant execute on function public.brl(integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Caixa de avisos, uma linha por pessoa avisada.
--
-- Uma linha por pessoa, e não uma linha por fato, porque cada lado lê e
-- descarta no seu tempo: o guia pode ter visto o aviso da reserva e o cliente
-- não. Guardar "lido" num fato compartilhado obrigaria a inventar uma segunda
-- tabela só para isso.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  booking_id  uuid references public.bookings(id) on delete cascade,
  tipo        text not null check (tipo in (
                'reserva_criada', 'reserva_confirmada', 'reserva_cancelada',
                'reserva_expirada', 'sinal_pago', 'saldo_quitado',
                'saldo_em_aberto', 'lembrete')),
  titulo      text not null,
  corpo       text not null,

  -- Retrato do dinheiro no momento do aviso. Nulo quando o aviso não fala de
  -- valores; zero é um valor, e não a ausência dele.
  valor_total_centavos  integer,
  valor_pago_centavos   integer,
  valor_aberto_centavos integer,

  lida_em     timestamptz,
  criado_em   timestamptz not null default now()
);

create index if not exists notifications_caixa
  on public.notifications (user_id, criado_em desc);
create index if not exists notifications_nao_lidas
  on public.notifications (user_id) where lida_em is null;

alter table public.notifications enable row level security;

drop policy if exists avisos_leitura_propria on public.notifications;
create policy avisos_leitura_propria on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Marcar como lido é a única escrita permitida. O `with check` do próprio dono
-- impede passar o aviso para outra pessoa; o resto das colunas é protegido pelo
-- gatilho abaixo, porque RLS decide por linha, nunca por coluna.
drop policy if exists avisos_marcar_lido on public.notifications;
create policy avisos_marcar_lido on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;

create or replace function public.aviso_so_muda_lida_em()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_master() then
    return new;
  end if;
  -- Sem isto, quem pode marcar como lido poderia reescrever o texto e os
  -- valores do próprio aviso — e o aviso deixaria de servir como registro.
  new.user_id               := old.user_id;
  new.booking_id            := old.booking_id;
  new.tipo                  := old.tipo;
  new.titulo                := old.titulo;
  new.corpo                 := old.corpo;
  new.valor_total_centavos  := old.valor_total_centavos;
  new.valor_pago_centavos   := old.valor_pago_centavos;
  new.valor_aberto_centavos := old.valor_aberto_centavos;
  new.criado_em             := old.criado_em;
  return new;
end;
$$;

drop trigger if exists aviso_so_muda_lida_em on public.notifications;
create trigger aviso_so_muda_lida_em
  before update on public.notifications
  for each row execute function public.aviso_so_muda_lida_em();


-- -----------------------------------------------------------------------------
-- Quanto já foi pago desta reserva.
--
-- Sai de `status_pagamento`, que é o campo que o webhook de pagamento mantém,
-- e não de uma soma de `payments` — que ainda não existe. Quando existir, os
-- três estados continuam sendo os mesmos e esta função é o único lugar a
-- mudar.
-- -----------------------------------------------------------------------------
create or replace function public.pago_da_reserva(r public.bookings)
returns integer
language sql
immutable
as $$
  select case r.status_pagamento
    when 'quitada'    then r.valor_total_centavos - r.desconto_centavos
    when 'sinal_pago' then r.sinal_centavos
    else 0
  end;
$$;

revoke all on function public.pago_da_reserva(public.bookings) from public, anon;
grant execute on function public.pago_da_reserva(public.bookings) to authenticated;


-- -----------------------------------------------------------------------------
-- O gatilho que avisa os dois lados.
-- -----------------------------------------------------------------------------
create or replace function public.avisar_sobre_reserva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente   uuid := new.user_id;
  v_guia_user uuid;
  v_barco     text;
  v_operacao  text;
  v_nome      text;
  v_data      text := to_char(new.data, 'DD/MM/YYYY');
  v_liquido   integer := new.valor_total_centavos - new.desconto_centavos;
  v_pago      integer := public.pago_da_reserva(new);
  v_aberto    integer;
  v_tipo      text;
  v_tit_cli   text;
  v_cor_cli   text;
  v_tit_gui   text;
  v_cor_gui   text;
begin
  v_aberto := v_liquido - v_pago;

  select g.user_id, g.nome_operacao into v_guia_user, v_operacao
    from public.guides g where g.id = new.guide_id;
  select b.nome into v_barco from public.boats b where b.id = new.boat_id;
  select p.nome into v_nome  from public.profiles p where p.id = v_cliente;

  if tg_op = 'INSERT' then
    v_tipo    := 'reserva_criada';
    v_tit_cli := 'Reserva feita para ' || v_data;
    v_cor_cli := 'Sua reserva com ' || coalesce(v_operacao, 'o guia') || ' no barco ' ||
                 coalesce(v_barco, '') || ' está guardada. Total ' || public.brl(v_liquido) ||
                 ', sinal de ' || public.brl(new.sinal_centavos) ||
                 ' para confirmar e saldo de ' || public.brl(new.saldo_centavos) || '.';
    v_tit_gui := 'Nova reserva para ' || v_data;
    v_cor_gui := coalesce(v_nome, 'Um pescador') || ' reservou ' || coalesce(v_barco, 'um barco') ||
                 ' para ' || new.qtd_pescadores || ' pescador(es). Total ' || public.brl(v_liquido) ||
                 ', sua parte ' || public.brl(new.repasse_guia_centavos) || '. Ainda em aberto: ' ||
                 public.brl(v_aberto) || '.';

  elsif new.status = 'cancelada' and old.status <> 'cancelada' then
    v_tipo    := 'reserva_cancelada';
    v_tit_cli := 'Reserva de ' || v_data || ' cancelada';
    v_cor_cli := 'A reserva do barco ' || coalesce(v_barco, '') || ' foi cancelada. Valor pago até aqui: ' ||
                 public.brl(v_pago) || '.';
    v_tit_gui := 'Reserva de ' || v_data || ' cancelada';
    v_cor_gui := 'A reserva de ' || coalesce(v_nome, 'um pescador') || ' no barco ' ||
                 coalesce(v_barco, '') || ' foi cancelada. A data voltou para a agenda.';

  elsif new.status = 'expirada' and old.status <> 'expirada' then
    v_tipo    := 'reserva_expirada';
    v_tit_cli := 'Reserva de ' || v_data || ' expirou';
    v_cor_cli := 'O prazo para pagar o sinal passou e a data voltou a ficar livre. ' ||
                 'Se ainda quiser ir, é só reservar de novo.';
    v_tit_gui := 'Reserva de ' || v_data || ' expirou';
    v_cor_gui := 'A reserva de ' || coalesce(v_nome, 'um pescador') || ' não foi paga no prazo. ' ||
                 'O barco ' || coalesce(v_barco, '') || ' está livre nessa data.';

  elsif new.status = 'confirmada' and old.status <> 'confirmada' then
    v_tipo    := 'reserva_confirmada';
    v_tit_cli := 'Pescaria confirmada para ' || v_data;
    v_cor_cli := 'Está confirmada' ||
                 case when new.codigo is not null then ' (código ' || new.codigo || ')' else '' end ||
                 '. Pago até aqui: ' || public.brl(v_pago) ||
                 '. Em aberto: ' || public.brl(v_aberto) ||
                 case when new.quitacao_vence_em is not null and v_aberto > 0
                      then ', a quitar até ' || to_char(new.quitacao_vence_em, 'DD/MM/YYYY') || '.'
                      else '.' end;
    v_tit_gui := 'Pescaria confirmada para ' || v_data;
    v_cor_gui := coalesce(v_nome, 'Um pescador') || ' confirmou o barco ' || coalesce(v_barco, '') ||
                 '. Sua parte: ' || public.brl(new.repasse_guia_centavos) ||
                 '. Em aberto com o cliente: ' || public.brl(v_aberto) || '.';

  elsif new.status_pagamento = 'sinal_pago' and old.status_pagamento = 'aguardando_sinal' then
    v_tipo    := 'sinal_pago';
    v_tit_cli := 'Sinal recebido — ' || v_data;
    v_cor_cli := 'Recebemos ' || public.brl(v_pago) || '. Falta ' || public.brl(v_aberto) ||
                 case when new.quitacao_vence_em is not null
                      then ', a quitar até ' || to_char(new.quitacao_vence_em, 'DD/MM/YYYY') || '.'
                      else '.' end;
    v_tit_gui := 'Sinal recebido — ' || v_data;
    v_cor_gui := 'O sinal da reserva de ' || coalesce(v_nome, 'um pescador') || ' entrou. ' ||
                 'Em aberto: ' || public.brl(v_aberto) || '.';

  elsif new.status_pagamento = 'quitada' and old.status_pagamento <> 'quitada' then
    v_tipo    := 'saldo_quitado';
    v_tit_cli := 'Pescaria quitada — ' || v_data;
    v_cor_cli := 'Está tudo pago: ' || public.brl(v_pago) || '. Nada em aberto.';
    v_tit_gui := 'Pescaria quitada — ' || v_data;
    v_cor_gui := 'A reserva de ' || coalesce(v_nome, 'um pescador') || ' está quitada. ' ||
                 'Sua parte: ' || public.brl(new.repasse_guia_centavos) || '.';

  else
    return new;  -- mudança que não interessa a ninguém
  end if;

  insert into public.notifications
    (user_id, booking_id, tipo, titulo, corpo,
     valor_total_centavos, valor_pago_centavos, valor_aberto_centavos)
  values
    (v_cliente,   new.id, v_tipo, v_tit_cli, v_cor_cli, v_liquido, v_pago, v_aberto);

  -- O guia pode não ter perfil se a operação foi semeada direto no banco.
  if v_guia_user is not null then
    insert into public.notifications
      (user_id, booking_id, tipo, titulo, corpo,
       valor_total_centavos, valor_pago_centavos, valor_aberto_centavos)
    values
      (v_guia_user, new.id, v_tipo, v_tit_gui, v_cor_gui, v_liquido, v_pago, v_aberto);
  end if;

  return new;
end;
$$;

drop trigger if exists avisar_sobre_reserva_insert on public.bookings;
create trigger avisar_sobre_reserva_insert
  after insert on public.bookings
  for each row execute function public.avisar_sobre_reserva();

drop trigger if exists avisar_sobre_reserva_update on public.bookings;
create trigger avisar_sobre_reserva_update
  after update on public.bookings
  for each row
  when (old.status is distinct from new.status
        or old.status_pagamento is distinct from new.status_pagamento)
  execute function public.avisar_sobre_reserva();


-- -----------------------------------------------------------------------------
-- Fechar um dia que já tem reserva não pode ser silencioso.
--
-- `boat_availability` não tem chave estrangeira vinda de `bookings` — a reserva
-- guarda o preço por conta própria, congelado. Sem esta trava, o guia apagaria
-- o dia sem nenhum aviso e a pescaria sumiria da agenda dele, continuando de pé
-- para o cliente.
-- -----------------------------------------------------------------------------
create or replace function public.dia_com_reserva_nao_fecha()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_alvo record;
begin
  v_alvo := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'UPDATE' and new.status = 'aberto' then
    return new;  -- reabrir nunca é problema
  end if;

  if exists (
    select 1 from public.bookings r
     where r.boat_id = v_alvo.boat_id
       and r.data    = v_alvo.data
       and r.status in ('pendente', 'confirmada')
  ) then
    raise exception 'Esta data já tem reserva. Cancele a reserva antes de fechar o dia.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists dia_com_reserva_nao_fecha on public.boat_availability;
create trigger dia_com_reserva_nao_fecha
  before delete or update on public.boat_availability
  for each row execute function public.dia_com_reserva_nao_fecha();


-- -----------------------------------------------------------------------------
-- A agenda do guia, com todos os barcos juntos.
--
-- Por período, e não por barco: o guia decide o dia dele olhando tudo o que sai
-- naquela data, não um casco de cada vez. Semana, mês e dia específico são a
-- mesma pergunta com intervalos diferentes — por isso um par de datas, e não
-- três funções.
--
-- Vem de função porque junta preço, reserva, cliente e dinheiro numa linha só;
-- montar isso no aplicativo exigiria quatro consultas e a chance de uma delas
-- vazar o que o guia não pode ver.
-- -----------------------------------------------------------------------------
create or replace function public.agenda_do_guia(p_de date, p_ate date)
returns table (
  data                      date,
  boat_id                   uuid,
  barco_nome                text,
  dia_status                text,
  preco_barco_centavos      integer,
  preco_passageiro_centavos integer,
  observacao                text,
  booking_id                uuid,
  reserva_status            text,
  status_pagamento          text,
  cliente_nome              text,
  cliente_telefone          text,
  qtd_pescadores            integer,
  valor_liquido_centavos    integer,
  valor_pago_centavos       integer,
  valor_aberto_centavos     integer,
  repasse_guia_centavos     integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with meus as (
    select b.id, b.nome
      from public.boats b
      join public.guides g on g.id = b.guide_id
     where g.user_id = auth.uid()
  ),
  -- Dia aberto na agenda OU dia com reserva ativa. O segundo caso importa
  -- porque a reserva sobrevive ao fechamento do dia — a pescaria continua de
  -- pé mesmo que a linha de preço tenha sumido.
  dias as (
    select a.boat_id, a.data from public.boat_availability a
     where a.boat_id in (select id from meus) and a.data between p_de and p_ate
    union
    select r.boat_id, r.data from public.bookings r
     where r.boat_id in (select id from meus) and r.data between p_de and p_ate
       and r.status in ('pendente', 'confirmada')
  )
  select
    d.data, d.boat_id, m.nome,
    a.status, a.preco_barco_centavos, a.preco_passageiro_centavos, a.observacao,
    r.id, r.status, r.status_pagamento,
    p.nome, p.telefone, r.qtd_pescadores,
    -- Dia sem reserva não tem "pago zero": não tem valor nenhum. Zero diria
    -- que existe uma pescaria e que ninguém pagou por ela.
    case when r.id is null then null else r.valor_total_centavos - r.desconto_centavos end,
    case when r.id is null then null else public.pago_da_reserva(r) end,
    case when r.id is null then null
         else (r.valor_total_centavos - r.desconto_centavos) - public.pago_da_reserva(r) end,
    r.repasse_guia_centavos
  from dias d
  join meus m on m.id = d.boat_id
  left join public.boat_availability a on a.boat_id = d.boat_id and a.data = d.data
  left join public.bookings r on r.boat_id = d.boat_id and r.data = d.data
                             and r.status in ('pendente', 'confirmada')
  left join public.profiles p on p.id = r.user_id
  order by d.data, m.nome;
$$;

revoke all on function public.agenda_do_guia(date, date) from public, anon;
grant execute on function public.agenda_do_guia(date, date) to authenticated;

comment on function public.agenda_do_guia(date, date) is
  'Agenda de todos os barcos do guia num período, com reserva, cliente e dinheiro. Filtra por auth.uid() por dentro.';


-- As funções de gatilho não são chamáveis de fora: o Supabase publica o schema
-- public como API REST, e toda função com EXECUTE aberto vira /rpc/<nome>.
revoke all on function public.avisar_sobre_reserva()      from public, anon, authenticated;
revoke all on function public.aviso_so_muda_lida_em()     from public, anon, authenticated;
revoke all on function public.dia_com_reserva_nao_fecha() from public, anon, authenticated;


-- ===== supabase/migrations/0009_agenda_da_plataforma.sql =====
-- =============================================================================
-- A agenda, para o guia e para o master
--
-- Substitui `agenda_do_guia`, que só sabia responder sobre quem perguntava. O
-- master precisa da plataforma inteira: é ele quem enxerga se um guia está com
-- a agenda vazia enquanto outro está lotado, e é dele a comissão de cada saída.
--
-- Uma função só, e não duas, porque a regra de quem vê o quê tem de morar num
-- lugar. Duas consultas parecidas divergem — e o dia em que divergirem, o lado
-- que vaza é o do master vendo tudo.
--
-- Idempotente.
-- =============================================================================

create or replace function public.agenda(
  p_de   date,
  p_ate  date,
  p_guia uuid default null
)
returns table (
  data                      date,
  guide_id                  uuid,
  guia_nome                 text,
  boat_id                   uuid,
  barco_nome                text,
  dia_status                text,
  preco_barco_centavos      integer,
  preco_passageiro_centavos integer,
  observacao                text,
  booking_id                uuid,
  reserva_status            text,
  status_pagamento          text,
  cliente_nome              text,
  cliente_telefone          text,
  qtd_pescadores            integer,
  valor_liquido_centavos    integer,
  valor_pago_centavos       integer,
  valor_aberto_centavos     integer,
  repasse_guia_centavos     integer,
  comissao_centavos         integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Quem vê o quê é decidido AQUI, uma vez. O guia enxerga os próprios barcos;
  -- o master, todos. `p_guia` só estreita o que já é permitido — passar o id de
  -- outro guia não abre nada, porque o filtro de dono vem antes.
  with escopo as (
    select b.id as boat_id, b.nome as barco_nome, g.id as guide_id, g.nome_operacao
      from public.boats b
      join public.guides g on g.id = b.guide_id
     where (g.user_id = auth.uid() or public.is_master())
       and (p_guia is null or g.id = p_guia)
  ),
  -- Dia aberto na agenda OU dia com reserva ativa. O segundo caso importa
  -- porque a reserva sobrevive ao fechamento do dia — a pescaria continua de
  -- pé mesmo que a linha de preço tenha sumido.
  dias as (
    select a.boat_id, a.data from public.boat_availability a
     where a.boat_id in (select boat_id from escopo) and a.data between p_de and p_ate
    union
    select r.boat_id, r.data from public.bookings r
     where r.boat_id in (select boat_id from escopo) and r.data between p_de and p_ate
       and r.status in ('pendente', 'confirmada')
  )
  select
    d.data, e.guide_id, e.nome_operacao, d.boat_id, e.barco_nome,
    a.status, a.preco_barco_centavos, a.preco_passageiro_centavos, a.observacao,
    r.id, r.status, r.status_pagamento,
    p.nome, p.telefone, r.qtd_pescadores,
    -- Dia sem reserva não tem "pago zero": não tem valor nenhum. Zero diria
    -- que existe uma pescaria e que ninguém pagou por ela.
    case when r.id is null then null else r.valor_total_centavos - r.desconto_centavos end,
    case when r.id is null then null else public.pago_da_reserva(r) end,
    case when r.id is null then null
         else (r.valor_total_centavos - r.desconto_centavos) - public.pago_da_reserva(r) end,
    r.repasse_guia_centavos,
    r.comissao_centavos
  from dias d
  join escopo e on e.boat_id = d.boat_id
  left join public.boat_availability a on a.boat_id = d.boat_id and a.data = d.data
  left join public.bookings r on r.boat_id = d.boat_id and r.data = d.data
                             and r.status in ('pendente', 'confirmada')
  left join public.profiles p on p.id = r.user_id
  order by d.data, e.nome_operacao, e.barco_nome;
$$;

revoke all on function public.agenda(date, date, uuid) from public, anon;
grant execute on function public.agenda(date, date, uuid) to authenticated;

comment on function public.agenda(date, date, uuid) is
  'Agenda do período: os barcos do guia, ou a plataforma inteira para o master. Decide o escopo por dentro.';


-- -----------------------------------------------------------------------------
-- Quem opera na plataforma, para o filtro do calendário do master.
--
-- Devolve só o que o filtro precisa. O painel de aprovação continua lendo
-- `guides` direto — lá o master precisa de documento, comissão e data de
-- inscrição, e aqui isso seria carga inútil trafegando à toa.
-- -----------------------------------------------------------------------------
create or replace function public.guias_com_agenda()
returns table (id uuid, nome_operacao text, cidade text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.nome_operacao, g.cidade
    from public.guides g
   where public.is_master()
     and g.status = 'aprovado'
   order by g.nome_operacao;
$$;

revoke all on function public.guias_com_agenda() from public, anon;
grant execute on function public.guias_com_agenda() to authenticated;


-- A versão antiga só sabia responder sobre quem perguntava. Mantê-la ao lado da
-- nova seria manter duas cópias da regra de quem enxerga o quê — e no dia em
-- que divergissem, o lado que vaza é o do master.
drop function if exists public.agenda_do_guia(date, date);


-- ===== supabase/migrations/0010_hora_de_saida.sql =====
-- =============================================================================
-- Hora de saída: campo próprio, não mais texto na observação
--
-- Estava escrita à mão no meio da observação ("Saída 5h"). Texto livre não
-- ordena, não compara e não avisa ninguém quando muda — e a agenda ordenada por
-- horário é o ponto todo de um calendário.
--
-- FICA NA AGENDA DO DIA, E NÃO NA RESERVA. Uma fonte só: se a reserva guardasse
-- uma cópia, o dia em que o guia adiantasse a saída existiriam duas horas
-- diferentes no banco e a errada seria a que o cliente lê. Mudou a hora com
-- reserva de pé, os dois lados são avisados — é isso que mantém todo mundo no
-- mesmo horário.
--
-- Nula é um estado legítimo: "a combinar" é como muita pescaria é fechada, e
-- obrigar um valor faria o guia inventar um.
--
-- Idempotente.
-- =============================================================================

alter table public.boat_availability
  add column if not exists hora_saida time;

comment on column public.boat_availability.hora_saida is
  'Hora de saída da pescaria. Nula = a combinar, que é um estado legítimo.';


-- -----------------------------------------------------------------------------
-- As três funções abaixo mudam de assinatura, e o Postgres não deixa trocar o
-- tipo de retorno com `create or replace`. Derrubar e recriar é o caminho.
-- -----------------------------------------------------------------------------
drop function if exists public.datas_disponiveis(uuid);
drop function if exists public.agenda(date, date, uuid);
drop function if exists public.minhas_reservas();


create function public.datas_disponiveis(p_boat_id uuid)
returns table (
  data                      date,
  hora_saida                time,
  preco_barco_centavos      integer,
  preco_passageiro_centavos integer,
  observacao                text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.data, a.hora_saida, a.preco_barco_centavos, a.preco_passageiro_centavos, a.observacao
    from public.boat_availability a
    join public.boats  b on b.id = a.boat_id
    join public.guides g on g.id = b.guide_id
   where a.boat_id = p_boat_id
     and a.status  = 'aberto'
     and a.data    > current_date
     and b.status  = 'ativo'
     and g.status  = 'aprovado'
     and g.mp_conectado_em is not null
     -- Ocupada é a que está confirmada, ou pendente cujo prazo de pagamento
     -- ainda não estourou. É a mesma condição do índice único de 0001, mais o
     -- vencimento — senão uma reserva abandonada esconderia a data para sempre.
     and not exists (
       select 1 from public.bookings r
        where r.boat_id = a.boat_id
          and r.data    = a.data
          and (r.status = 'confirmada'
               or (r.status = 'pendente'
                   and (r.expira_em is null or r.expira_em > now()))))
   order by a.data, a.hora_saida nulls last;
$$;

revoke all on function public.datas_disponiveis(uuid) from public, anon;
grant execute on function public.datas_disponiveis(uuid) to authenticated;

comment on function public.datas_disponiveis(uuid) is
  'Datas livres de um barco. Diz que o dia está tomado, nunca por quem.';


create function public.agenda(
  p_de   date,
  p_ate  date,
  p_guia uuid default null
)
returns table (
  data                      date,
  hora_saida                time,
  guide_id                  uuid,
  guia_nome                 text,
  boat_id                   uuid,
  barco_nome                text,
  dia_status                text,
  preco_barco_centavos      integer,
  preco_passageiro_centavos integer,
  observacao                text,
  booking_id                uuid,
  reserva_status            text,
  status_pagamento          text,
  cliente_nome              text,
  cliente_telefone          text,
  qtd_pescadores            integer,
  valor_liquido_centavos    integer,
  valor_pago_centavos       integer,
  valor_aberto_centavos     integer,
  repasse_guia_centavos     integer,
  comissao_centavos         integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Quem vê o quê é decidido AQUI, uma vez. O guia enxerga os próprios barcos;
  -- o master, todos. `p_guia` só estreita o que já é permitido — passar o id de
  -- outro guia não abre nada, porque o filtro de dono vem antes.
  with escopo as (
    select b.id as boat_id, b.nome as barco_nome, g.id as guide_id, g.nome_operacao
      from public.boats b
      join public.guides g on g.id = b.guide_id
     where (g.user_id = auth.uid() or public.is_master())
       and (p_guia is null or g.id = p_guia)
  ),
  dias as (
    select a.boat_id, a.data from public.boat_availability a
     where a.boat_id in (select boat_id from escopo) and a.data between p_de and p_ate
    union
    select r.boat_id, r.data from public.bookings r
     where r.boat_id in (select boat_id from escopo) and r.data between p_de and p_ate
       and r.status in ('pendente', 'confirmada')
  )
  select
    d.data, a.hora_saida, e.guide_id, e.nome_operacao, d.boat_id, e.barco_nome,
    a.status, a.preco_barco_centavos, a.preco_passageiro_centavos, a.observacao,
    r.id, r.status, r.status_pagamento,
    p.nome, p.telefone, r.qtd_pescadores,
    -- Dia sem reserva não tem "pago zero": não tem valor nenhum.
    case when r.id is null then null else r.valor_total_centavos - r.desconto_centavos end,
    case when r.id is null then null else public.pago_da_reserva(r) end,
    case when r.id is null then null
         else (r.valor_total_centavos - r.desconto_centavos) - public.pago_da_reserva(r) end,
    r.repasse_guia_centavos,
    r.comissao_centavos
  from dias d
  join escopo e on e.boat_id = d.boat_id
  left join public.boat_availability a on a.boat_id = d.boat_id and a.data = d.data
  left join public.bookings r on r.boat_id = d.boat_id and r.data = d.data
                             and r.status in ('pendente', 'confirmada')
  left join public.profiles p on p.id = r.user_id
  -- Quem não marcou hora vai para o fim do dia. Tratar nulo como zero colocaria
  -- "a combinar" antes da saída das quatro da manhã.
  order by d.data, a.hora_saida nulls last, e.nome_operacao, e.barco_nome;
$$;

revoke all on function public.agenda(date, date, uuid) from public, anon;
grant execute on function public.agenda(date, date, uuid) to authenticated;

comment on function public.agenda(date, date, uuid) is
  'Agenda do período: os barcos do guia, ou a plataforma inteira para o master. Decide o escopo por dentro.';


create function public.minhas_reservas()
returns table (
  id                   uuid,
  codigo               text,
  data                 date,
  hora_saida           time,
  qtd_pescadores       integer,
  valor_total_centavos integer,
  desconto_centavos    integer,
  sinal_centavos       integer,
  saldo_centavos       integer,
  status               text,
  status_pagamento     text,
  quitacao_vence_em    date,
  expira_em            timestamptz,
  guia_nome            text,
  guia_cidade          text,
  barco_nome           text,
  observacao           text,
  participantes        jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.codigo, r.data, a.hora_saida, r.qtd_pescadores,
         r.valor_total_centavos, r.desconto_centavos,
         r.sinal_centavos, r.saldo_centavos,
         r.status, r.status_pagamento, r.quitacao_vence_em, r.expira_em,
         g.nome_operacao, g.cidade, b.nome, a.observacao,
         coalesce(
           (select jsonb_agg(jsonb_build_object('nome', p.nome, 'telefone', p.telefone)
                             order by p.nome)
              from public.booking_participants p where p.booking_id = r.id),
           '[]'::jsonb)
    from public.bookings r
    join public.guides g on g.id = r.guide_id
    join public.boats  b on b.id = r.boat_id
    -- À esquerda de propósito: passada a pescaria, o guia pode apagar o dia da
    -- agenda, e a reserva não pode sumir do histórico do cliente por causa disso.
    left join public.boat_availability a on a.boat_id = r.boat_id and a.data = r.data
   where r.user_id = auth.uid()
   order by r.data desc;
$$;

revoke all on function public.minhas_reservas() from public, anon;
grant execute on function public.minhas_reservas() to authenticated;

comment on function public.minhas_reservas() is
  'Reservas de quem está pedindo, com nome do guia, do barco e a hora de saída. Filtra por auth.uid() por dentro.';


-- -----------------------------------------------------------------------------
-- Mudar o horário de um dia com reserva de pé avisa os dois lados.
--
-- É o motivo de a hora morar num lugar só. Quem já reservou organizou a viagem
-- em volta daquele horário; descobrir a mudança ao chegar no ponto de encontro
-- é o pior jeito possível.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('reserva_criada', 'reserva_confirmada', 'reserva_cancelada',
                  'reserva_expirada', 'sinal_pago', 'saldo_quitado',
                  'saldo_em_aberto', 'horario_alterado', 'lembrete'));

create or replace function public.avisar_mudanca_de_horario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  v_guia     uuid;
  v_barco    text;
  v_data     text := to_char(new.data, 'DD/MM/YYYY');
  v_de       text := coalesce(to_char(old.hora_saida, 'HH24:MI'), 'a combinar');
  v_para     text := coalesce(to_char(new.hora_saida, 'HH24:MI'), 'a combinar');
begin
  if new.hora_saida is not distinct from old.hora_saida then
    return new;
  end if;

  select b.nome, g.user_id into v_barco, v_guia
    from public.boats b join public.guides g on g.id = b.guide_id
   where b.id = new.boat_id;

  for r in
    select * from public.bookings
     where boat_id = new.boat_id and data = new.data
       and status in ('pendente', 'confirmada')
  loop
    insert into public.notifications (user_id, booking_id, tipo, titulo, corpo)
    values (
      r.user_id, r.id, 'horario_alterado',
      'Mudou a hora da pescaria de ' || v_data,
      'A saída do barco ' || coalesce(v_barco, '') || ' passou de ' || v_de ||
      ' para ' || v_para || '. Confirme com o guia se precisar.'
    );

    if v_guia is not null then
      insert into public.notifications (user_id, booking_id, tipo, titulo, corpo)
      values (
        v_guia, r.id, 'horario_alterado',
        'Você mudou a hora de ' || v_data,
        'A saída do barco ' || coalesce(v_barco, '') || ' passou de ' || v_de ||
        ' para ' || v_para || '. O cliente foi avisado.'
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists avisar_mudanca_de_horario on public.boat_availability;
create trigger avisar_mudanca_de_horario
  after update on public.boat_availability
  for each row execute function public.avisar_mudanca_de_horario();

revoke all on function public.avisar_mudanca_de_horario() from public, anon, authenticated;


