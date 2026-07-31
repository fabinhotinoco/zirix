-- =============================================================================
-- Plataforma de Pescarias — schema inicial
--
-- Escrito para Supabase: assume que o schema `auth` (com auth.users e
-- auth.uid()) e os papéis anon / authenticated / service_role já existem.
-- Para rodar localmente, aplique antes supabase/tests/00_shim_auth.sql.
--
-- Duas regras estruturam tudo aqui:
--   1. Guia nenhum enxerga dado de outro guia. Isso vive em RLS, não na tela.
--   2. A coordenada exata da captura nunca sai do servidor para quem não é
--      Diamond. Por isso `catches` não é legível diretamente: o feed passa
--      por uma view que anula os campos sensíveis.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- Perfis
-- =============================================================================

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text not null,
  telefone          text,
  email             text,
  avatar_url        text,
  role              text not null default 'cliente'
                    check (role in ('master', 'guia', 'cliente')),
  aceita_avisos_captura boolean not null default true,
  criado_em         timestamptz not null default now()
);

-- =============================================================================
-- Configurações e documentos legais
-- =============================================================================

create table public.app_settings (
  chave       text primary key,
  valor       jsonb not null,
  descricao   text,
  atualizado_em timestamptz not null default now()
);

create table public.legal_documents (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null
                check (slug in ('contrato_guia', 'contrato_cliente',
                                'politica_cancelamento', 'termo_responsabilidade',
                                'politica_privacidade')),
  versao        text not null,
  titulo        text not null,
  corpo_markdown text not null,
  -- Preenchido por trigger. É o que permite provar, meses depois, exatamente
  -- qual texto a pessoa aceitou — a versão sozinha não prova, porque o corpo
  -- pode ter sido editado.
  hash_sha256   text not null default '',
  vigente_desde timestamptz not null default now(),
  publicado_por uuid references public.profiles(id),
  unique (slug, versao)
);

create or replace function public.calcular_hash_documento()
returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.hash_sha256 := encode(extensions.digest(new.corpo_markdown, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger trg_hash_documento
  before insert or update of corpo_markdown on public.legal_documents
  for each row execute function public.calcular_hash_documento();

create table public.terms_acceptances (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  booking_id      uuid,
  documento_slug  text not null,
  versao          text not null,
  hash_sha256     text not null,
  ip              inet,
  user_agent      text,
  aceito_em       timestamptz not null default now()
);

create index on public.terms_acceptances (user_id, documento_slug);

-- =============================================================================
-- Guias e flotilha
-- =============================================================================

create table public.guides (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique references public.profiles(id) on delete cascade,
  nome_operacao               text not null,
  documento                   text,
  cidade                      text,
  bio                         text,
  foto_url                    text,
  status                      text not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'suspenso')),
  -- Nulo = usa o padrão da plataforma. Ver cascata em docs/PLANEJAMENTO.md.
  comissao_percentual         numeric(5,2) check (comissao_percentual between 0 and 100),
  sinal_percentual            numeric(5,2) check (sinal_percentual between 0 and 100),
  prazo_quitacao_dias         integer check (prazo_quitacao_dias >= 0),
  oferece_desconto_diamond    boolean not null default false,
  desconto_diamond_percentual numeric(5,2) not null default 0
                              check (desconto_diamond_percentual between 0 and 100),
  local_operacao_lat          double precision,
  local_operacao_lng          double precision,
  checklist                   text,
  ponto_encontro              text,
  -- Credenciais do Mercado Pago do guia. Nunca chegam ao aplicativo:
  -- só as Edge Functions, com service_role, as leem.
  mp_user_id                  text,
  mp_access_token             text,
  mp_refresh_token            text,
  mp_conectado_em             timestamptz,
  aprovado_por                uuid references public.profiles(id),
  aprovado_em                 timestamptz,
  criado_em                   timestamptz not null default now()
);

create index on public.guides (status);

create table public.boats (
  id                  uuid primary key default gen_random_uuid(),
  guide_id            uuid not null references public.guides(id) on delete cascade,
  nome                text not null,
  modelo              text,
  capacidade_min      integer not null default 1 check (capacidade_min >= 1),
  capacidade_max      integer not null check (capacidade_max >= 1),
  fotos               jsonb not null default '[]'::jsonb,
  equipamentos        text,
  comissao_percentual numeric(5,2) check (comissao_percentual between 0 and 100),
  status              text not null default 'ativo' check (status in ('ativo', 'inativo')),
  criado_em           timestamptz not null default now(),
  check (capacidade_max >= capacidade_min)
);

create index on public.boats (guide_id);

create table public.boat_availability (
  boat_id                   uuid not null references public.boats(id) on delete cascade,
  data                      date not null,
  status                    text not null default 'aberto'
                            check (status in ('aberto', 'bloqueado')),
  preco_barco_centavos      integer not null default 0 check (preco_barco_centavos >= 0),
  preco_passageiro_centavos integer not null default 0 check (preco_passageiro_centavos >= 0),
  aberto_em                 timestamptz not null default now(),
  observacao                text,
  primary key (boat_id, data),
  -- Um dia sem preço nenhum não é vendável.
  check (preco_barco_centavos + preco_passageiro_centavos > 0)
);

create index on public.boat_availability (data) where status = 'aberto';

-- =============================================================================
-- Reservas
-- =============================================================================

create table public.bookings (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text unique,
  user_id                   uuid not null references public.profiles(id),
  guide_id                  uuid not null references public.guides(id),
  boat_id                   uuid not null references public.boats(id),
  data                      date not null,
  qtd_pescadores            integer not null check (qtd_pescadores >= 1),

  preco_barco_centavos      integer not null check (preco_barco_centavos >= 0),
  preco_passageiro_centavos integer not null check (preco_passageiro_centavos >= 0),
  valor_total_centavos      integer not null check (valor_total_centavos >= 0),
  desconto_centavos         integer not null default 0 check (desconto_centavos >= 0),

  -- Congelados na criação: renegociar a comissão amanhã não pode mexer
  -- no valor de uma reserva fechada ontem.
  comissao_percentual       numeric(5,2) not null check (comissao_percentual between 0 and 100),
  comissao_centavos         integer not null check (comissao_centavos >= 0),
  repasse_guia_centavos     integer not null check (repasse_guia_centavos >= 0),

  sinal_centavos            integer not null check (sinal_centavos >= 0),
  saldo_centavos            integer not null check (saldo_centavos >= 0),

  status                    text not null default 'pendente'
                            check (status in ('pendente', 'confirmada', 'cancelada', 'expirada')),
  status_pagamento          text not null default 'aguardando_sinal'
                            check (status_pagamento in ('aguardando_sinal', 'sinal_pago', 'quitada')),

  quitacao_vence_em         date,
  quitada_em                timestamptz,
  expira_em                 timestamptz,
  confirmada_em             timestamptz,
  cancelada_em              timestamptz,
  no_show                   boolean not null default false,

  termo_versao              text,
  politica_versao           text,
  criado_em                 timestamptz not null default now(),

  check (valor_total_centavos - desconto_centavos = sinal_centavos + saldo_centavos),
  check (comissao_centavos + repasse_guia_centavos = valor_total_centavos - desconto_centavos)
);

-- A trava que impede vender o mesmo barco duas vezes no mesmo dia.
-- É o banco que garante isso, não a aplicação: dois clientes clicando no
-- mesmo segundo não conseguem passar os dois.
create unique index bookings_barco_data_ativa
  on public.bookings (boat_id, data)
  where status in ('pendente', 'confirmada');

create index on public.bookings (user_id);
create index on public.bookings (guide_id);
create index on public.bookings (status, quitacao_vence_em)
  where status = 'confirmada';

create table public.booking_participants (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  nome        text not null,
  telefone    text
);

create index on public.booking_participants (booking_id);

-- =============================================================================
-- Pagamentos e financeiro
-- =============================================================================

create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid not null references public.bookings(id) on delete cascade,
  tipo                    text not null check (tipo in ('sinal', 'saldo', 'integral')),
  provider                text not null default 'mercadopago',
  provider_payment_id     text unique,
  metodo                  text check (metodo in ('pix', 'credito', 'debito')),
  valor_centavos          integer not null check (valor_centavos > 0),
  -- application_fee em /v1/payments; marketplace_fee no Checkout Pro.
  marketplace_fee_centavos integer not null default 0 check (marketplace_fee_centavos >= 0),
  valor_estornado_centavos integer not null default 0 check (valor_estornado_centavos >= 0),
  status                  text not null default 'pendente',
  vence_em                timestamptz,
  payload_bruto           jsonb,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  check (valor_estornado_centavos <= valor_centavos)
);

create index on public.payments (booking_id);

create table public.ledger_entries (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  text not null
                        check (tipo in ('comissao_passeio', 'assinatura_diamond',
                                        'estorno', 'outro')),
  booking_id            uuid references public.bookings(id) on delete set null,
  payment_id            uuid references public.payments(id) on delete set null,
  subscription_id       uuid,
  guide_id              uuid references public.guides(id) on delete set null,
  valor_bruto_centavos  integer not null,
  comissao_centavos     integer not null,
  repasse_centavos      integer not null,
  descricao             text,
  ocorrido_em           timestamptz not null default now()
);

create index on public.ledger_entries (guide_id, ocorrido_em);
create index on public.ledger_entries (booking_id);

create table public.cancellation_rules (
  id                  uuid primary key default gen_random_uuid(),
  guide_id            uuid references public.guides(id) on delete cascade,
  dias_min            integer not null,
  dias_max            integer,
  retencao_percentual numeric(5,2) not null check (retencao_percentual between 0 and 100),
  ordem               integer not null default 0,
  vigente_desde       timestamptz not null default now()
);

create index on public.cancellation_rules (guide_id, ordem);

-- =============================================================================
-- Assinaturas
-- =============================================================================

create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  plano           text not null default 'diamond' check (plano in ('diamond')),
  inicio          date not null default current_date,
  fim             date not null,
  status          text not null default 'ativa'
                  check (status in ('ativa', 'expirada', 'cancelada')),
  valor_centavos  integer,
  origem          text not null default 'manual' check (origem in ('manual')),
  ativado_por     uuid references public.profiles(id),
  observacao      text,
  criado_em       timestamptz not null default now(),
  check (fim >= inicio)
);

create index on public.subscriptions (user_id, status, fim);

-- =============================================================================
-- Lista de espera, avaliações
-- =============================================================================

create table public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  boat_id       uuid not null references public.boats(id) on delete cascade,
  data          date not null,
  status        text not null default 'aguardando'
                check (status in ('aguardando', 'avisado', 'convertido', 'removido')),
  notificado_em timestamptz,
  criado_em     timestamptz not null default now(),
  unique (user_id, boat_id, data)
);

create index on public.waitlist (boat_id, data, criado_em);

create table public.reviews (
  booking_id  uuid primary key references public.bookings(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  guide_id    uuid not null references public.guides(id) on delete cascade,
  nota        integer not null check (nota between 1 and 5),
  comentario  text,
  criado_em   timestamptz not null default now()
);

create index on public.reviews (guide_id);

-- =============================================================================
-- Capturas
-- =============================================================================

create table public.catches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  booking_id      uuid references public.bookings(id) on delete set null,
  guide_id        uuid references public.guides(id) on delete set null,
  foto_path       text not null,
  especie         text,
  peso_kg         numeric(6,3) check (peso_kg >= 0),
  comprimento_cm  numeric(6,2) check (comprimento_cm >= 0),
  regiao_nome     text,
  -- Campos exclusivos do Diamond. Nunca são expostos por select direto:
  -- o acesso passa obrigatoriamente por v_catches_feed.
  lat             double precision,
  lng             double precision,
  ocultar_ponto   boolean not null default false,
  isca            text,
  profundidade_m  numeric(6,2),
  hora_fisgada    time,
  condicao_tempo  text,
  capturado_em    timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

create index on public.catches (capturado_em desc);
create index on public.catches (user_id);

create table public.catch_likes (
  catch_id  uuid not null references public.catches(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (catch_id, user_id)
);

-- =============================================================================
-- Dispositivos e notificações
-- =============================================================================

create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  plataforma      text check (plataforma in ('ios', 'android')),
  criado_em       timestamptz not null default now()
);

create index on public.devices (user_id);

create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  destino     text,
  canal       text not null check (canal in ('sms', 'email', 'push')),
  template    text,
  status      text not null,
  erro        text,
  enviado_em  timestamptz not null default now()
);

create index on public.notification_log (user_id, enviado_em desc);

-- =============================================================================
-- Funções de identidade e papel
-- =============================================================================

create or replace function public.is_master()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master'
  );
$$;

comment on function public.is_master() is
  'Verdadeiro para o administrador da plataforma. Base de toda política de escrita global.';

create or replace function public.is_guide_owner(g uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.guides
    where id = g and user_id = auth.uid()
  );
$$;

comment on function public.is_guide_owner(uuid) is
  'Verdadeiro se o usuário logado é dono do guia informado. Isola um guia do outro.';

create or replace function public.is_diamond(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid
      and plano = 'diamond'
      and status = 'ativa'
      and fim >= current_date
  );
$$;

comment on function public.is_diamond(uuid) is
  'Assinatura Diamond ativa e não vencida. Vencida a data, o acesso cai sozinho.';

-- =============================================================================
-- Views
-- =============================================================================

-- ATENÇÃO: esta view é deliberadamente SECURITY DEFINER (o padrão do Postgres,
-- security_invoker = false). É isso que permite revogar completamente o acesso
-- direto a `catches` e ainda assim servir o feed: a view lê a tabela como dona,
-- e devolve as colunas sensíveis anuladas para quem não é Diamond.
--
-- Com security_invoker = true isto NÃO funcionaria: a leitura seria feita com a
-- permissão de quem chama, e teríamos de liberar `catches` para todo mundo.
create view public.v_catches_feed as
select
  c.id,
  c.user_id,
  c.guide_id,
  c.foto_path,
  c.especie,
  c.peso_kg,
  c.comprimento_cm,
  c.regiao_nome,
  c.capturado_em,
  (select count(*) from public.catch_likes l where l.catch_id = c.id) as curtidas,
  case when public.is_diamond() and not c.ocultar_ponto then c.lat end            as lat,
  case when public.is_diamond() and not c.ocultar_ponto then c.lng end            as lng,
  case when public.is_diamond() then c.isca end                                   as isca,
  case when public.is_diamond() then c.profundidade_m end                         as profundidade_m,
  case when public.is_diamond() then c.hora_fisgada end                           as hora_fisgada,
  case when public.is_diamond() then c.condicao_tempo end                         as condicao_tempo
from public.catches c;

-- O dono da captura vê sempre os próprios dados, inclusive sem ser Diamond.
create view public.v_minhas_capturas as
select c.* from public.catches c where c.user_id = auth.uid();

create view public.v_ranking_mensal as
select
  date_trunc('month', c.capturado_em)::date as mes,
  c.especie,
  c.id as catch_id,
  c.user_id,
  p.nome as pescador,
  c.peso_kg,
  c.foto_path,
  rank() over (
    partition by date_trunc('month', c.capturado_em), c.especie
    order by c.peso_kg desc nulls last
  ) as posicao
from public.catches c
join public.profiles p on p.id = c.user_id
where c.peso_kg is not null;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.app_settings         enable row level security;
alter table public.legal_documents      enable row level security;
alter table public.terms_acceptances    enable row level security;
alter table public.guides               enable row level security;
alter table public.boats                enable row level security;
alter table public.boat_availability    enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_participants enable row level security;
alter table public.payments             enable row level security;
alter table public.ledger_entries       enable row level security;
alter table public.cancellation_rules   enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.waitlist             enable row level security;
alter table public.reviews              enable row level security;
alter table public.catches              enable row level security;
alter table public.catch_likes          enable row level security;
alter table public.devices              enable row level security;
alter table public.notification_log     enable row level security;

-- --- profiles ---------------------------------------------------------------
create policy profiles_select_proprio on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_master());

-- O guia precisa do contato de quem reservou com ele — e só desses.
create policy profiles_select_cliente_do_guia on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.user_id = public.profiles.id
      and public.is_guide_owner(b.guide_id)
  ));

create policy profiles_update_proprio on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_insert_proprio on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- --- app_settings / legal_documents / cancellation_rules --------------------
create policy settings_leitura on public.app_settings
  for select to authenticated using (true);
create policy settings_escrita_master on public.app_settings
  for all to authenticated using (public.is_master()) with check (public.is_master());

create policy documentos_leitura on public.legal_documents
  for select to authenticated using (true);
create policy documentos_escrita_master on public.legal_documents
  for all to authenticated using (public.is_master()) with check (public.is_master());

create policy regras_cancel_leitura on public.cancellation_rules
  for select to authenticated using (true);
create policy regras_cancel_escrita on public.cancellation_rules
  for all to authenticated
  using (public.is_master() or public.is_guide_owner(guide_id))
  with check (public.is_master() or public.is_guide_owner(guide_id));

-- --- terms_acceptances ------------------------------------------------------
-- Aceite é registro imutável: pode inserir e ler o próprio, nunca alterar.
create policy aceites_insert_proprio on public.terms_acceptances
  for insert to authenticated with check (user_id = auth.uid());
create policy aceites_select_proprio on public.terms_acceptances
  for select to authenticated using (user_id = auth.uid() or public.is_master());

-- --- guides -----------------------------------------------------------------
create policy guias_leitura_publica on public.guides
  for select to authenticated
  using (status = 'aprovado' or user_id = auth.uid() or public.is_master());

create policy guias_insert_proprio on public.guides
  for insert to authenticated with check (user_id = auth.uid());

create policy guias_update_proprio on public.guides
  for update to authenticated
  using (user_id = auth.uid() or public.is_master())
  with check (user_id = auth.uid() or public.is_master());

-- --- boats ------------------------------------------------------------------
create policy barcos_leitura on public.boats
  for select to authenticated
  using (
    (status = 'ativo' and exists (
      select 1 from public.guides g where g.id = boats.guide_id and g.status = 'aprovado'))
    or public.is_guide_owner(guide_id)
    or public.is_master()
  );

create policy barcos_escrita_dono on public.boats
  for all to authenticated
  using (public.is_guide_owner(guide_id) or public.is_master())
  with check (public.is_guide_owner(guide_id) or public.is_master());

-- --- boat_availability ------------------------------------------------------
create policy agenda_leitura on public.boat_availability
  for select to authenticated using (true);

create policy agenda_escrita_dono on public.boat_availability
  for all to authenticated
  using (exists (
    select 1 from public.boats b
    where b.id = boat_availability.boat_id
      and (public.is_guide_owner(b.guide_id) or public.is_master())))
  with check (exists (
    select 1 from public.boats b
    where b.id = boat_availability.boat_id
      and (public.is_guide_owner(b.guide_id) or public.is_master())));

-- --- bookings ---------------------------------------------------------------
-- Criação e mudança de status são feitas só pelas Edge Functions
-- (service_role), que recalculam preço e comissão no servidor. O aplicativo
-- não insere reserva direto — se pudesse, poderia escolher o próprio preço.
create policy reservas_leitura on public.bookings
  for select to authenticated
  using (user_id = auth.uid() or public.is_guide_owner(guide_id) or public.is_master());

create policy participantes_leitura on public.booking_participants
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_participants.booking_id
      and (b.user_id = auth.uid() or public.is_guide_owner(b.guide_id) or public.is_master())));

-- --- payments / ledger ------------------------------------------------------
create policy pagamentos_leitura on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = payments.booking_id
      and (b.user_id = auth.uid() or public.is_guide_owner(b.guide_id) or public.is_master())));

create policy extrato_leitura on public.ledger_entries
  for select to authenticated
  using (public.is_guide_owner(guide_id) or public.is_master());

-- --- subscriptions ----------------------------------------------------------
create policy assinaturas_leitura on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid() or public.is_master());

create policy assinaturas_escrita_master on public.subscriptions
  for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- --- waitlist ---------------------------------------------------------------
create policy fila_propria on public.waitlist
  for all to authenticated
  using (
    user_id = auth.uid()
    or public.is_master()
    or exists (select 1 from public.boats b
               where b.id = waitlist.boat_id and public.is_guide_owner(b.guide_id))
  )
  with check (user_id = auth.uid());

-- --- reviews ----------------------------------------------------------------
create policy avaliacoes_leitura on public.reviews
  for select to authenticated using (true);

create policy avaliacoes_insert_proprio on public.reviews
  for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.bookings b
    where b.id = reviews.booking_id and b.user_id = auth.uid()));

-- --- catches ----------------------------------------------------------------
-- Sem política de SELECT para authenticated: a leitura acontece por
-- v_catches_feed (feed) e v_minhas_capturas (próprias). Assim a coordenada
-- não tem por onde escapar.
create policy capturas_insert_proprio on public.catches
  for insert to authenticated with check (user_id = auth.uid());

create policy capturas_update_proprio on public.catches
  for update to authenticated
  using (user_id = auth.uid() or public.is_master())
  with check (user_id = auth.uid() or public.is_master());

create policy capturas_delete_proprio on public.catches
  for delete to authenticated
  using (user_id = auth.uid() or public.is_master());

create policy curtidas_leitura on public.catch_likes
  for select to authenticated using (true);
create policy curtidas_proprias on public.catch_likes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- devices / notification_log ---------------------------------------------
create policy dispositivos_proprios on public.devices
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notificacoes_master on public.notification_log
  for select to authenticated using (public.is_master());

-- =============================================================================
-- Permissões de tabela
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated;

-- `catches` sai da regra geral: nenhum acesso direto, nem de leitura.
revoke select on public.catches from authenticated;

-- Colunas do guia com credencial do Mercado Pago: fora do alcance do app.
revoke select on public.guides from authenticated;
grant select (id, user_id, nome_operacao, documento, cidade, bio, foto_url, status,
              comissao_percentual, sinal_percentual, prazo_quitacao_dias,
              oferece_desconto_diamond, desconto_diamond_percentual,
              local_operacao_lat, local_operacao_lng, checklist, ponto_encontro,
              mp_conectado_em, aprovado_em, criado_em)
  on public.guides to authenticated;

grant select on public.v_catches_feed, public.v_minhas_capturas,
                public.v_ranking_mensal to authenticated;

grant all on all tables in schema public to service_role;
