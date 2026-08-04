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
-- Derruba antes de criar. O `atualizacoes.sql` reaplica todas as migrações a
-- cada execução, e uma migração posterior muda o tipo de retorno desta função —
-- `create or replace` recusa mudança de retorno e travaria o robô 5 no banco
-- que já está de pé.
drop function if exists public.datas_disponiveis(uuid);
create function public.datas_disponiveis(p_boat_id uuid)
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
drop function if exists public.minhas_reservas();
create function public.minhas_reservas()
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
