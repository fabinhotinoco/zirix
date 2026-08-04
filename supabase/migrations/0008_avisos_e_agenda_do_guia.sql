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
