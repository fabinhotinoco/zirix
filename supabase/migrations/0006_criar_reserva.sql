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
