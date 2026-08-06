-- =============================================================================
-- O que o webhook precisa do banco
--
-- O aviso do Mercado Pago diz apenas "o pagamento X mudou" e de qual CONTA ele
-- é. Para ler esse pagamento é preciso o token daquele guia — o pagamento vive
-- na conta dele, não na nossa.
--
-- É por isso que existe esta função: dado o identificador da conta no Mercado
-- Pago, devolver o token decifrado. Só a Edge Function chama.
--
-- Idempotente.
-- =============================================================================

create or replace function public.guia_por_mp_user(p_mp_user_id text, p_chave text)
returns table (guide_id uuid, mp_access_token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(p_chave, '') = '' then
    raise exception 'Falta a chave de cifra dos tokens.' using errcode = 'check_violation';
  end if;

  return query
    select g.id,
           extensions.pgp_sym_decrypt(decode(g.mp_access_token, 'base64'), p_chave)
      from public.guides g
     where g.mp_user_id = p_mp_user_id
       and g.mp_access_token is not null;
end;
$$;

revoke all on function public.guia_por_mp_user(text, text)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Registrar uma devolução.
--
-- Separado de `registrar_pagamento` de propósito: estornar não é pagar com
-- sinal trocado. O estorno mexe num pagamento que já existe, pode ser parcial,
-- pode acontecer várias vezes sobre a mesma cobrança, e precisa reverter a
-- comissão na mesma proporção.
--
-- É idempotente pelo VALOR ACUMULADO, não por evento: o Mercado Pago informa
-- quanto do pagamento já foi devolvido no total, e reenvia esse número. Somar a
-- cada aviso devolveria o dobro; guardar o total e lançar só a diferença é o
-- que aguenta reenvio.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_estorno(
  p_provider_payment_id     text,
  p_total_estornado_centavos integer
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pagamento public.payments;
  v_reserva   public.bookings;
  v_novo      integer;
  v_comissao_revertida integer;
begin
  select * into v_pagamento
    from public.payments
   where provider_payment_id = p_provider_payment_id
   for update;

  if not found then
    raise exception 'Pagamento % não encontrado para estorno.', p_provider_payment_id
      using errcode = 'check_violation';
  end if;

  if p_total_estornado_centavos < 0
     or p_total_estornado_centavos > v_pagamento.valor_centavos then
    raise exception 'Valor devolvido (%) fora da faixa do pagamento (%).',
      p_total_estornado_centavos, v_pagamento.valor_centavos
      using errcode = 'check_violation';
  end if;

  -- Só a diferença é novidade. Reenvio do mesmo total não lança nada.
  v_novo := p_total_estornado_centavos - v_pagamento.valor_estornado_centavos;
  if v_novo <= 0 then
    return v_pagamento;
  end if;

  update public.payments
     set valor_estornado_centavos = p_total_estornado_centavos,
         status = case when p_total_estornado_centavos >= valor_centavos
                       then 'estornado' else status end,
         atualizado_em = now()
   where id = v_pagamento.id
  returning * into v_pagamento;

  select * into v_reserva from public.bookings where id = v_pagamento.booking_id;

  -- A comissão volta na mesma proporção do que foi devolvido. Devolver metade
  -- da cobrança e ficar com a comissão inteira seria cobrar intermediação de um
  -- serviço que não aconteceu.
  v_comissao_revertida := round(
    v_pagamento.marketplace_fee_centavos::numeric * v_novo / v_pagamento.valor_centavos);

  insert into public.ledger_entries (
    tipo, booking_id, payment_id, guide_id,
    valor_bruto_centavos, comissao_centavos, repasse_centavos, descricao
  ) values (
    'estorno', v_pagamento.booking_id, v_pagamento.id, v_reserva.guide_id,
    -v_novo, -v_comissao_revertida, -(v_novo - v_comissao_revertida),
    'devolução ao cliente'
  );

  return v_pagamento;
end;
$$;

revoke all on function public.registrar_estorno(text, integer)
  from public, anon, authenticated;

comment on function public.registrar_estorno(text, integer) is
  'Registra devolução por total acumulado e reverte a comissão proporcional. Aguenta reenvio.';
