-- =============================================================================
-- Preparar uma cobrança
--
-- Quem monta a cobrança no Mercado Pago é uma Edge Function, mas quem decide
-- **quanto cobrar e qual comissão vai no split** é esta função. Pelo mesmo
-- motivo de sempre: é regra de dinheiro, e regra de dinheiro em SQL é testada
-- em CI a cada envio, sem depender de rede nem de conta de teste.
--
-- QUEM INFORMA O PREÇO NÃO PODE SER QUEM PAGA. O aplicativo manda apenas o id
-- da reserva e o tipo da cobrança. Valor e comissão saem daqui, do que está
-- congelado na reserva desde que ela foi criada.
--
-- A COMISSÃO DO SALDO É O QUE FALTA, não uma segunda conta. Calcular
-- `round(comissao × saldo ÷ líquido)` daria um centavo de diferença em algumas
-- reservas, e a soma das taxas deixaria de bater com `comissao_centavos`. Aqui
-- a última cobrança absorve o arredondamento por construção: ela cobra tudo o
-- que ainda não foi lançado.
--
-- Idempotente.
-- =============================================================================

create or replace function public.preparar_cobranca(
  p_booking_id uuid,
  p_tipo       text,   -- 'sinal' | 'saldo' | 'integral'
  p_user_id    uuid,   -- vem do JWT já verificado pela Edge Function
  p_chave      text    -- chave de cifra dos tokens, do cofre da função
)
returns table (
  valor_centavos     integer,
  fee_centavos       integer,
  descricao          text,
  guide_id           uuid,
  mp_access_token    text,
  referencia_externa text,
  email_pagador      text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_reserva  public.bookings;
  v_guia     public.guides;
  v_liquido  integer;
  v_valor    integer;
  v_fee      integer;
  v_lancado  integer;
  v_barco    text;
begin
  if coalesce(p_chave, '') = '' then
    raise exception 'Falta a chave de cifra dos tokens.' using errcode = 'check_violation';
  end if;

  select * into v_reserva from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'check_violation';
  end if;

  -- A cobrança é do dono da reserva. Sem esta linha, quem descobrisse o id de
  -- uma reserva alheia geraria um link de pagamento para ela.
  if v_reserva.user_id <> p_user_id then
    raise exception 'Esta reserva não é sua.' using errcode = 'insufficient_privilege';
  end if;

  if v_reserva.status not in ('pendente', 'confirmada') then
    raise exception 'Esta reserva está % e não aceita pagamento.', v_reserva.status
      using errcode = 'check_violation';
  end if;

  -- O tipo tem de fazer sentido para o momento da reserva. Sem isto, um
  -- aplicativo desatualizado pediria o sinal de uma reserva já confirmada e o
  -- cliente pagaria duas vezes.
  if p_tipo in ('sinal', 'integral') and v_reserva.status_pagamento <> 'aguardando_sinal' then
    raise exception 'Esta reserva já teve o sinal pago.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'saldo' and v_reserva.status_pagamento <> 'sinal_pago' then
    raise exception 'O saldo só é cobrado depois do sinal.' using errcode = 'check_violation';
  end if;

  select * into v_guia from public.guides where id = v_reserva.guide_id;
  if v_guia.mp_conectado_em is null or v_guia.mp_access_token is null then
    raise exception 'O guia desconectou a conta de recebimento. Fale com a administração.'
      using errcode = 'check_violation';
  end if;

  v_liquido := v_reserva.valor_total_centavos - v_reserva.desconto_centavos;

  -- Quanto já foi lançado de comissão nos pagamentos aprovados desta reserva.
  select coalesce(sum(p.marketplace_fee_centavos), 0) into v_lancado
    from public.payments p
   where p.booking_id = p_booking_id and p.status = 'aprovado';

  if p_tipo = 'sinal' then
    v_valor := v_reserva.sinal_centavos;
    v_fee   := round(v_reserva.comissao_centavos::numeric * v_valor / v_liquido);
  elsif p_tipo = 'saldo' then
    v_valor := v_reserva.saldo_centavos;
    -- Tudo o que falta. É aqui que o centavo de arredondamento é absorvido.
    v_fee   := v_reserva.comissao_centavos - v_lancado;
  elsif p_tipo = 'integral' then
    v_valor := v_liquido;
    v_fee   := v_reserva.comissao_centavos;
  else
    raise exception 'Tipo de cobrança desconhecido: %', p_tipo using errcode = 'check_violation';
  end if;

  -- Rede de segurança: comissão negativa ou maior que a cobrança seria recusada
  -- pelo Mercado Pago, mas com uma mensagem que não diz nada. Melhor parar aqui.
  if v_fee < 0 or v_fee > v_valor then
    raise exception 'Comissão calculada (%) inválida para uma cobrança de %.', v_fee, v_valor
      using errcode = 'check_violation';
  end if;

  select b.nome into v_barco from public.boats b where b.id = v_reserva.boat_id;

  return query
    select
      v_valor,
      v_fee,
      format('Pescaria %s — %s (%s)',
             to_char(v_reserva.data, 'DD/MM/YYYY'),
             coalesce(v_guia.nome_operacao, 'guia'),
             case p_tipo when 'sinal' then 'sinal'
                         when 'saldo' then 'quitação'
                         else 'pagamento integral' end),
      v_guia.id,
      extensions.pgp_sym_decrypt(decode(v_guia.mp_access_token, 'base64'), p_chave),
      -- O que volta no webhook e liga o pagamento à reserva e ao tipo.
      p_booking_id::text || ':' || p_tipo,
      (select pr.email from public.profiles pr where pr.id = v_reserva.user_id);
end;
$$;

revoke all on function public.preparar_cobranca(uuid, text, uuid, text)
  from public, anon, authenticated;

comment on function public.preparar_cobranca(uuid, text, uuid, text) is
  'Valor e comissão de uma cobrança, com o token do guia. Só a Edge Function chama.';
