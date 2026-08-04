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
