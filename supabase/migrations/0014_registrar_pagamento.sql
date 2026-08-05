-- =============================================================================
-- O lado do banco do pagamento
--
-- O webhook do Mercado Pago chega numa Edge Function, mas quem decide o que
-- acontece com a reserva é ESTA função. O motivo é o de sempre neste projeto:
-- regra de dinheiro em SQL é regra testável sem rede, e testada em CI a cada
-- envio.
--
-- TRÊS PROPRIEDADES QUE ESTA FUNÇÃO PRECISA TER, E POR QUÊ:
--
-- 1. **Idempotência.** O Mercado Pago reenvia o mesmo aviso quando não recebe
--    200 rápido o bastante — e reenvia de novo depois. Sem trava, a mesma
--    entrada de dinheiro viraria dois lançamentos no extrato e a comissão
--    apareceria em dobro. A trava é o `provider_payment_id`, que é único no
--    provedor e único na nossa tabela.
--
-- 2. **Conferência de valor.** O aviso diz quanto foi pago. Se não bater com o
--    que a reserva espera, a função RECUSA em vez de confirmar. Confirmar uma
--    pescaria pelo valor errado é pior que não confirmar: o cliente embarca
--    achando que pagou, e a diferença aparece semanas depois.
--
-- 3. **Um caminho só para o dinheiro.** Todo pagamento aprovado gera exatamente
--    um lançamento no `ledger_entries`. É esse lançamento que o extrato lê, e é
--    ele que precisa bater com o extrato do Mercado Pago no fim do mês.
--
-- Idempotente (a migração, e a função).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Código da reserva, gerado só quando ela é confirmada.
--
-- Antes do pagamento a reserva é uma intenção que expira em 20 minutos; dar
-- número a ela gastaria a sequência com reservas que nunca existiram, e o
-- cliente guardaria um código que some.
-- -----------------------------------------------------------------------------
create sequence if not exists public.codigo_reserva_seq;

-- Tenta até achar um número livre.
--
-- A sequência sozinha não basta: existem códigos que NÃO vieram dela — a massa
-- de teste tem os seus, e um dia o suporte vai corrigir um à mão. Sem o laço, o
-- primeiro pagamento de verdade quebraria com "duplicate key", e o erro
-- apareceria no webhook, longe da causa. Foi exatamente o que aconteceu no
-- teste desta migração.
create or replace function public.proximo_codigo_de_reserva()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
  v_ano    text := to_char(now(), 'YYYY');
begin
  for _ in 1..1000 loop
    v_codigo := 'PV-' || v_ano || '-'
                || lpad(nextval('public.codigo_reserva_seq')::text, 4, '0');
    if not exists (select 1 from public.bookings where codigo = v_codigo) then
      return v_codigo;
    end if;
  end loop;
  raise exception 'Não consegui gerar um código de reserva livre.';
end;
$$;

revoke all on function public.proximo_codigo_de_reserva() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Registrar um pagamento vindo do provedor.
--
-- Chamada pela Edge Function do webhook, com service_role. Nunca pelo
-- aplicativo: quem diz que um pagamento aconteceu é o provedor, não o celular
-- de quem pagou.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  p_booking_id          uuid,
  p_tipo                text,     -- 'sinal' | 'saldo' | 'integral'
  p_provider_payment_id text,
  p_metodo              text,     -- 'pix' | 'credito' | 'debito'
  p_valor_centavos      integer,
  p_fee_centavos        integer,
  p_status              text,     -- 'aprovado' | 'pendente' | 'recusado' | 'estornado'
  p_payload             jsonb default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva   public.bookings;
  v_pagamento public.payments;
  v_esperado  integer;
  v_liquido   integer;
  v_ja_existia boolean := false;
begin
  if coalesce(p_provider_payment_id, '') = '' then
    raise exception 'Pagamento sem identificador do provedor não pode ser registrado.'
      using errcode = 'check_violation';
  end if;

  select * into v_reserva from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'check_violation';
  end if;

  v_liquido := v_reserva.valor_total_centavos - v_reserva.desconto_centavos;

  -- Quanto esta cobrança deveria ter sido.
  v_esperado := case p_tipo
                  when 'sinal'    then v_reserva.sinal_centavos
                  when 'saldo'    then v_reserva.saldo_centavos
                  when 'integral' then v_liquido
                end;
  if v_esperado is null then
    raise exception 'Tipo de pagamento desconhecido: %', p_tipo using errcode = 'check_violation';
  end if;

  if p_valor_centavos <> v_esperado then
    raise exception
      'O valor pago (% centavos) não corresponde ao % desta reserva (% centavos).',
      p_valor_centavos, p_tipo, v_esperado
      using errcode = 'check_violation';
  end if;

  -- --- a trava de idempotência ---------------------------------------------
  select * into v_pagamento
    from public.payments
   where provider_payment_id = p_provider_payment_id
   for update;

  if found then
    v_ja_existia := true;
    -- Reenvio do mesmo aviso. O status pode ter mudado (pendente → aprovado),
    -- e isso vale atualizar; o resto fica como está.
    update public.payments
       set status = p_status,
           payload_bruto = coalesce(p_payload, payload_bruto),
           atualizado_em = now()
     where id = v_pagamento.id
    returning * into v_pagamento;
  else
    insert into public.payments (
      booking_id, tipo, provider_payment_id, metodo,
      valor_centavos, marketplace_fee_centavos, status, payload_bruto
    ) values (
      p_booking_id, p_tipo, p_provider_payment_id, p_metodo,
      p_valor_centavos, p_fee_centavos, p_status, p_payload
    )
    returning * into v_pagamento;
  end if;

  -- Só dinheiro aprovado mexe na reserva. Pendente e recusado ficam
  -- registrados para o extrato e para o suporte, sem confirmar nada.
  if p_status <> 'aprovado' then
    return v_pagamento;
  end if;

  -- --- o lançamento no extrato ---------------------------------------------
  -- Um por pagamento aprovado, nunca dois. `not exists` em vez de contar com o
  -- caminho de cima: se um dia outra rota chamar esta função, a garantia
  -- continua valendo.
  if not exists (
    select 1 from public.ledger_entries
     where payment_id = v_pagamento.id and tipo = 'comissao_passeio'
  ) then
    insert into public.ledger_entries (
      tipo, booking_id, payment_id, guide_id,
      valor_bruto_centavos, comissao_centavos, repasse_centavos, descricao
    ) values (
      'comissao_passeio', p_booking_id, v_pagamento.id, v_reserva.guide_id,
      p_valor_centavos, p_fee_centavos, p_valor_centavos - p_fee_centavos,
      p_tipo || ' da reserva'
    );
  end if;

  -- --- avançar a reserva ----------------------------------------------------
  -- Reserva já quitada não volta atrás por causa de um reenvio.
  if v_reserva.status_pagamento = 'quitada' then
    return v_pagamento;
  end if;

  if p_tipo = 'sinal' then
    update public.bookings
       set status_pagamento = 'sinal_pago',
           status = 'confirmada',
           codigo = coalesce(codigo, public.proximo_codigo_de_reserva()),
           confirmada_em = coalesce(confirmada_em, now())
     where id = p_booking_id;
  else
    -- 'saldo' e 'integral' fecham a conta. O código também é gerado aqui,
    -- porque quem quita no ato nunca passou pelo caminho do sinal.
    update public.bookings
       set status_pagamento = 'quitada',
           status = 'confirmada',
           codigo = coalesce(codigo, public.proximo_codigo_de_reserva()),
           confirmada_em = coalesce(confirmada_em, now()),
           quitada_em = now()
     where id = p_booking_id;
  end if;

  return v_pagamento;
end;
$$;

revoke all on function public.registrar_pagamento(uuid, text, text, text, integer, integer, text, jsonb)
  from public, anon, authenticated;

comment on function public.registrar_pagamento(uuid, text, text, text, integer, integer, text, jsonb) is
  'Registra um pagamento do provedor, avança a reserva e lança a comissão. Idempotente por provider_payment_id.';


-- -----------------------------------------------------------------------------
-- Quanto já entrou numa reserva, agora descontando o que foi devolvido.
--
-- A versão de 0008 derivava só do `status_pagamento` da reserva. Continua sendo
-- essa a fonte — é ela que a agenda, os avisos e a tela de reservas usam, e
-- trocá-la por uma soma da tabela de pagamentos faria toda reserva marcada como
-- paga pelo painel aparecer com zero.
--
-- O QUE MUDA é o desconto do estorno. Sem ele, uma reserva devolvida
-- continuaria aparecendo como paga no aviso e na agenda — e o guia embarcaria
-- alguém que já recebeu o dinheiro de volta.
--
-- Deixa de ser `immutable` porque agora lê uma tabela. `stable` basta: dentro
-- de uma consulta o resultado não muda.
-- -----------------------------------------------------------------------------
create or replace function public.pago_da_reserva(r public.bookings)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select greatest(0,
    case r.status_pagamento
      when 'quitada'    then r.valor_total_centavos - r.desconto_centavos
      when 'sinal_pago' then r.sinal_centavos
      else 0
    end
    - coalesce((
        select sum(p.valor_estornado_centavos)
          from public.payments p
         where p.booking_id = r.id
      ), 0)
  )::integer;
$$;

revoke all on function public.pago_da_reserva(public.bookings) from public, anon;
grant execute on function public.pago_da_reserva(public.bookings) to authenticated;
