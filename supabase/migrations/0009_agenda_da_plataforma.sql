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
