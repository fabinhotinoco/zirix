-- =============================================================================
-- SETUP COMPLETO — cole tudo isto no SQL Editor do Supabase e clique em Run.
--
-- Deixa o banco pronto: tabelas, políticas de segurança, valores padrão e os
-- cinco documentos legais. Roda uma vez só, num projeto novo.
--
-- GERADO AUTOMATICAMENTE por tools/build-setup-sql.mjs — não edite este
-- arquivo. Altere supabase/migrations/, supabase/seed.sql ou docs/legal/ e
-- rode o script de novo.
-- =============================================================================

-- ===== supabase/migrations/0001_init.sql =====
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


-- ===== supabase/seed.sql =====
-- =============================================================================
-- Valores padrão da plataforma.
--
-- Todos são editáveis no painel do master — estão aqui apenas como ponto de
-- partida. Os números de negócio (comissão, preço do Diamond) ainda precisam
-- ser definidos; os que estão abaixo são os propostos em docs/PLANEJAMENTO.md.
-- =============================================================================

insert into public.app_settings (chave, valor, descricao) values
  ('comissao_padrao_percentual',   '10',    'Comissão da plataforma quando guia e barco não têm valor próprio'),
  ('sinal_percentual_padrao',      '30',    'Percentual do valor total cobrado como sinal'),
  ('prazo_quitacao_dias',          '7',     'Dias antes da pescaria em que o saldo vence'),
  ('taxa_administrativa_percentual','5',    'Retenção mínima em qualquer cancelamento'),
  ('reserva_expira_minutos',       '20',    'Tempo que a reserva não paga segura a data'),
  ('arrependimento_dias',          '7',     'Art. 49 do CDC: devolução integral neste prazo'),
  ('remarcacao_antecedencia_dias', '15',    'Antecedência mínima para remarcar sem custo'),
  ('transferencia_titular_horas',  '48',    'Até quantas horas antes é possível transferir a reserva'),
  ('diamond_dias_antecipacao',     '14',    'Dias de agenda exclusiva para membros Diamond'),
  ('diamond_preco_anual_centavos', 'null',  'A DEFINIR — preço anual do plano Diamond'),
  ('previsao_dias_antecedencia',   '7',     'A partir de quantos dias antes a previsão do tempo aparece'),
  ('avaliacao_nota_alerta',        '3',     'Nota igual ou menor dispara alerta para o master'),
  ('checklist_padrao',
   '"Documento com foto, protetor solar, boné, água, remédio de uso contínuo e roupa de troca."',
   'Texto do lembrete D-3; cada guia pode sobrescrever'),
  ('ponto_encontro_padrao',
   '"A combinar com o guia — confira no lembrete de véspera."',
   'Texto do lembrete D-1; cada guia pode sobrescrever')
on conflict (chave) do nothing;

-- =============================================================================
-- Escala de retenção padrão (guide_id nulo = vale para toda a plataforma).
-- Guias podem ter faixas próprias; ver docs/legal/politica-cancelamento.md.
-- =============================================================================

insert into public.cancellation_rules (guide_id, dias_min, dias_max, retencao_percentual, ordem) values
  (null, 30, null, 5,   1),   -- 30 dias ou mais: só a taxa administrativa
  (null, 15,   29, 25,  2),
  (null,  7,   14, 50,  3),
  (null,  3,    6, 75,  4),
  (null,  0,    2, 100, 5);   -- menos de 48h ou não comparecimento


-- ===== documentos legais (docs/legal/) =====
-- Gerado por tools/seed-legal.mjs. Não edite à mão:
-- altere os arquivos em docs/legal/ e rode o script de novo.
-- O hash é recalculado pelo gatilho trg_hash_documento.

-- contrato-adesao-guia.md  (sha256 be493e1caac2c78cd50f5d4d43bf2702d34f20c413a23e3bbfa0150e13b85684)
insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
values ('contrato_guia', '1.0', $doc$Contrato de Adesão — Guia de Pesca$doc$, $doc$> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Foi redigido como ponto de partida técnico e precisa de
> revisão por advogado antes de entrar em produção. Os campos em MAIÚSCULAS entre colchetes devem ser
> preenchidos. Nenhuma cláusula aqui substitui parecer jurídico.

# Contrato de Adesão — Guia de Pesca

**[NOME DA PLATAFORMA]**, inscrita no CNPJ sob o nº **[CNPJ]**, com sede em **[ENDEREÇO]**, doravante
denominada **PLATAFORMA**, e a pessoa física ou jurídica que preenche o cadastro de guia no
aplicativo, doravante denominada **GUIA**, celebram o presente Contrato de Adesão, que se aperfeiçoa
no momento em que o GUIA assinala a caixa de aceite no cadastro.

---

## 1. Objeto e natureza da relação

**1.1.** A PLATAFORMA é um **serviço de intermediação digital** que aproxima guias de pesca e
pescadores, disponibilizando agenda, reservas, cobrança e comunicação.

**1.2.** **A PLATAFORMA NÃO É OPERADORA DE PASSEIOS, NÃO POSSUI EMBARCAÇÕES E NÃO PRESTA O SERVIÇO DE
PESCARIA.** O serviço é prestado exclusivamente pelo GUIA, por sua conta e risco.

**1.3.** Este contrato não cria vínculo empregatício, societário, de representação ou de exclusividade
entre as partes. O GUIA mantém autonomia sobre sua operação, sua agenda e seus preços.

## 2. Cadastro e aprovação

**2.1.** O cadastro do GUIA fica **pendente até aprovação da PLATAFORMA**, que pode ser concedida ou
negada a critério dela, sem obrigação de motivação.

**2.2.** O GUIA declara que todas as informações prestadas são verdadeiras e se obriga a mantê-las
atualizadas, respondendo civil e criminalmente por informação falsa.

**2.3.** O acesso é pessoal e intransferível. O GUIA responde por toda atividade realizada com suas
credenciais.

## 3. Habilitação legal e segurança

**3.1.** O GUIA declara e garante, durante toda a vigência deste contrato, que:

a) possui as **habilitações e certificações exigidas pela autoridade marítima competente** para
conduzir embarcação em atividade remunerada de transporte de passageiros;

b) mantém suas **embarcações regularizadas, inscritas e vistoriadas** conforme a legislação aplicável;

c) dispõe dos **equipamentos de segurança obrigatórios** e em validade, incluindo coletes salva-vidas
em número suficiente para a lotação declarada;

d) possui os **seguros exigidos por lei** para a atividade, quando aplicável;

e) possui, quando aplicável, licença ambiental, autorização de pesca e cadastro em órgãos de turismo;

f) não excederá a **lotação máxima** informada no cadastro de cada embarcação.

**3.2.** A PLATAFORMA pode solicitar a comprovação documental de qualquer item acima a qualquer tempo,
e **suspender o cadastro do GUIA enquanto a documentação não for apresentada**.

**3.3.** **A RESPONSABILIDADE PELA SEGURANÇA DOS PASSAGEIROS DURANTE O PASSEIO É EXCLUSIVA DO GUIA.**

## 4. Agenda, reservas e execução

**4.1.** O GUIA define livremente suas datas disponíveis, sua frota, sua lotação e seus preços.

**4.2.** **Reserva confirmada e paga é compromisso firme do GUIA.** O cancelamento por iniciativa do
GUIA obriga-o a devolver integralmente os valores recebidos do cliente e sujeita-o às penalidades da
cláusula 9, salvo nas hipóteses da cláusula 4.3.

**4.3.** O cancelamento por **condição climática adversa, restrição de autoridade competente ou
impedimento de força maior** não gera penalidade, desde que comunicado pelo aplicativo assim que
conhecido. Nessas hipóteses o GUIA deve oferecer nova data ou reembolso integral, à escolha do cliente.

**4.4.** O GUIA se obriga a conferir, no aplicativo, o **status de pagamento** de cada reserva antes do
embarque.

## 5. Preços, comissão e forma de recebimento

**5.1.** O preço de cada passeio é formado por valor da embarcação por dia e/ou valor por passageiro,
definidos pelo GUIA.

**5.2.** Pela intermediação, a PLATAFORMA faz jus a uma **comissão** correspondente ao percentual
acordado no cadastro do GUIA, incidente sobre o valor total de cada reserva.

**5.3.** **O percentual de comissão vigente no momento da criação de cada reserva é o aplicável àquela
reserva**, ainda que seja alterado posteriormente.

**5.4.** A comissão pode ser alterada para reservas futuras mediante **comunicação com 30 (trinta) dias
de antecedência**. Discordando, o GUIA pode rescindir este contrato sem ônus, respeitadas as reservas
já confirmadas.

**5.5.** Todos os pagamentos são processados **exclusivamente pelo aplicativo**, por meio do Mercado
Pago, em duas cobranças (sinal e quitação) ou em cobrança única.

**5.6.** O GUIA deve conectar sua própria conta Mercado Pago ao aplicativo. **Sem essa conexão, o GUIA
não consegue publicar agenda.**

**5.7.** **O GUIA AUTORIZA EXPRESSAMENTE A RETENÇÃO DA COMISSÃO NA ORIGEM**, mediante divisão
automática do pagamento (*split*), de modo que a parcela do GUIA seja creditada diretamente em sua
conta e a comissão na conta da PLATAFORMA.

**5.8.** O prazo de liberação dos valores na conta do GUIA segue as regras do Mercado Pago, não da
PLATAFORMA. **Reserva quitada não significa saldo imediatamente disponível.**

**5.9.** O GUIA é o único responsável pela emissão de documentos fiscais ao cliente e pelo recolhimento
dos tributos incidentes sobre sua receita. A PLATAFORMA emite documento fiscal apenas quanto à
comissão de intermediação.

## 6. Estornos, chargebacks e compensação

**6.1.** Havendo **estorno, chargeback, contestação, fraude ou reembolso** de qualquer valor pago por
um cliente, a parcela correspondente será revertida.

**6.2.** **CLÁUSULA DE DESTAQUE — DEVOLUÇÃO E COMPENSAÇÃO.** Como o valor do GUIA é creditado
diretamente na conta dele no momento do pagamento, **o GUIA obriga-se a restituir a parcela que lhe
coube em até 10 (dez) dias corridos contados da notificação do estorno**, e **autoriza desde já a
PLATAFORMA a compensar esse valor com créditos futuros** decorrentes de outras reservas.

**6.3.** Não havendo créditos futuros suficientes, o valor pode ser cobrado diretamente, e este
contrato, acompanhado do extrato da reserva, constitui **título executivo extrajudicial** para os fins
do art. 784, III, do Código de Processo Civil.

**6.4.** A comissão da PLATAFORMA sobre a operação estornada é igualmente revertida, com lançamento
negativo no extrato.

## 7. Dados pessoais e não circunvenção

**7.1.** O GUIA recebe dados pessoais de clientes e participantes **exclusivamente para executar a
pescaria contratada**, na qualidade de controlador quanto à sua própria operação, obrigando-se a
observar a Lei nº 13.709/2018 (LGPD).

**7.2.** **É VEDADO AO GUIA** utilizar dados obtidos pela PLATAFORMA para marketing próprio não
solicitado, repassá-los a terceiros ou incorporá-los a bases próprias para finalidade diversa da
execução do passeio.

**7.3.** **CLÁUSULA DE DESTAQUE — NÃO CIRCUNVENÇÃO.** É vedado ao GUIA aliciar cliente conhecido por
meio da PLATAFORMA para contratar fora dela, oferecer condição melhor por canal externo ou orientar o
cliente a pagar por fora do aplicativo, durante a vigência deste contrato e por **12 (doze) meses**
após seu término. A violação sujeita o GUIA à multa de **[VALOR OU PERCENTUAL]** por ocorrência, além
do descredenciamento imediato.

**7.4.** O GUIA não pode divulgar dados de outros guias, preços de terceiros ou informações da
operação da PLATAFORMA a que tenha acesso.

## 8. Conteúdo e imagem

**8.1.** O GUIA garante ser titular ou licenciado das fotos e textos que publica e concede à PLATAFORMA
**licença não exclusiva, gratuita e pelo prazo do contrato** para exibi-los no aplicativo, no site e
em material de divulgação.

**8.2.** O GUIA autoriza a exibição de sua nota média de avaliação, calculada a partir das avaliações
dos clientes, e reconhece que **avaliações não são removidas a pedido**, salvo violação das regras de
conduta.

## 9. Suspensão, descredenciamento e penalidades

**9.1.** A PLATAFORMA pode **suspender ou descredenciar** o GUIA, imediatamente e sem aviso prévio, em
caso de: risco à segurança de passageiros, documentação irregular ou vencida, cancelamentos reiterados,
informação falsa, violação da cláusula 7, inadimplemento da cláusula 6, ou nota média inferior a
**[NOTA MÍNIMA]** de forma reiterada.

**9.2.** A suspensão não afeta reservas já confirmadas, que deverão ser honradas ou reembolsadas.

**9.3.** O cancelamento injustificado de reserva confirmada sujeita o GUIA, além do reembolso integral
ao cliente, a **[PENALIDADE]**.

## 10. Limitação de responsabilidade da PLATAFORMA

**10.1.** **CLÁUSULA DE DESTAQUE.** A PLATAFORMA responde apenas pelo funcionamento do serviço de
intermediação. **Não responde pela qualidade, segurança, pontualidade ou resultado da pescaria, nem por
danos pessoais, materiais ou ambientais ocorridos durante o passeio**, que são de responsabilidade
exclusiva do GUIA.

**10.2.** O GUIA se obriga a **manter a PLATAFORMA indene** de reclamações, autuações ou ações
propostas por clientes, participantes, terceiros ou autoridades em razão de sua operação, arcando com
custas, honorários e eventuais condenações.

**10.3.** A PLATAFORMA não garante volume mínimo de reservas, faturamento ou disponibilidade
ininterrupta do aplicativo.

## 11. Vigência, rescisão e alterações

**11.1.** Este contrato vigora por prazo indeterminado a partir do aceite.

**11.2.** Qualquer das partes pode rescindi-lo a qualquer tempo, mediante aviso de **30 (trinta) dias**
pelo aplicativo, **honrando-se as reservas já confirmadas**.

**11.3.** A PLATAFORMA pode alterar este contrato. **A nova versão é apresentada ao GUIA no aplicativo
e exige novo aceite**; até que ele ocorra, o acesso às funções de agenda pode ser restringido. As
reservas já confirmadas permanecem regidas pela versão aceita à época.

**11.4.** Cada aceite é registrado com **data, hora, endereço IP, dispositivo, versão do documento e
código de verificação do texto aceito**, servindo como prova da manifestação de vontade.

## 12. Disposições finais

**12.1.** A tolerância quanto ao descumprimento de qualquer cláusula não implica novação ou renúncia.

**12.2.** A nulidade de uma cláusula não prejudica as demais.

**12.3.** Aplica-se a legislação brasileira. Fica eleito o foro da comarca de **[COMARCA]** para
dirimir controvérsias, com renúncia a qualquer outro.

---

*Versão 1.0 — vigente desde [DATA]. Ao assinalar a caixa de aceite no cadastro, o GUIA declara ter
lido, compreendido e concordado integralmente com este contrato.*$doc$)
on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;

-- contrato-uso-cliente.md  (sha256 09bc09b2afc79adb75eec1aef0e46f53e8ebb20d65509f9e5a897ff92ad25da1)
insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
values ('contrato_cliente', '1.0', $doc$Termos de Uso e Contrato de Adesão — Pescador$doc$, $doc$> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Foi redigido como ponto de partida técnico e precisa de
> revisão por advogado antes de entrar em produção. Trata-se de contrato de consumo, sujeito ao Código
> de Defesa do Consumidor. Os campos em MAIÚSCULAS entre colchetes devem ser preenchidos.

# Termos de Uso e Contrato de Adesão — Pescador

Bem-vindo ao **[NOME DA PLATAFORMA]**. Este documento explica as regras de uso do aplicativo e o que
você pode esperar de nós. Leia com atenção: ao assinalar a caixa de aceite no cadastro, você concorda
com tudo o que está aqui.

**[NOME DA PLATAFORMA]**, CNPJ **[CNPJ]**, sede em **[ENDEREÇO]**, é a **PLATAFORMA**. Você, pescador
cadastrado, é o **USUÁRIO**.

---

## 1. O que a plataforma é (e o que não é)

**1.1.** O aplicativo é um **serviço de intermediação**: ele mostra a agenda dos guias de pesca,
permite reservar uma data, cadastrar os participantes e pagar.

**1.2.** **A PESCARIA É PRESTADA PELO GUIA, NÃO PELA PLATAFORMA.** Ao reservar, você contrata o guia
escolhido. A plataforma organiza a reserva e o pagamento.

**1.3.** A plataforma verifica a documentação declarada pelos guias no cadastro, mas **não fiscaliza
cada passeio**. Reclamações sobre a execução do serviço devem ser dirigidas ao guia, e a plataforma
oferece canal de suporte para intermediar.

## 2. Cadastro

**2.1.** Para usar o aplicativo você precisa ser **maior de 18 anos**, informar dados verdadeiros e
manter seu contato atualizado — é por ele que enviamos a confirmação da reserva e avisos importantes.

**2.2.** Sua conta é pessoal. Não empreste suas credenciais.

**2.3.** Podemos suspender contas com dados falsos, uso fraudulento ou conduta que viole a cláusula 8.

## 3. Reserva, sinal e quitação

**3.1.** A reserva é de **dia inteiro e exclusiva para a embarcação escolhida**.

**3.2.** **A data só fica reservada depois que o sinal é pago.** Antes disso, ela continua disponível
para outros pescadores. A reserva não paga expira automaticamente em **20 minutos**.

**3.3.** Você pode pagar apenas o sinal ou **quitar o valor total no ato**.

**3.4.** Optando pelo sinal, **o saldo deve ser pago pelo aplicativo até a data limite informada na sua
reserva** (por padrão, 7 dias antes da pescaria). Enviaremos lembretes.

**3.5.** **CLÁUSULA DE DESTAQUE — NÃO PAGAMENTO DO SALDO.** Se o saldo não for pago até a data limite,
a reserva é **cancelada automaticamente** e a data é liberada para outros pescadores, aplicando-se a
regra de retenção do sinal prevista na Política de Cancelamento vigente.

**3.6.** **Todos os pagamentos são feitos pelo aplicativo.** Não pague ao guia por fora — pagamentos
externos não são reconhecidos pela plataforma, não geram comprovante no app e ficam sem qualquer
proteção.

**3.7.** Aceitamos Pix, cartão de crédito e cartão de débito, processados pelo Mercado Pago. A
plataforma não armazena os dados do seu cartão.

## 4. Cancelamento e reembolso

**4.1.** As regras de prazo e reembolso constam da **Política de Cancelamento**, apresentada a você na
tela de pagamento e aceita junto com a reserva.

**4.2.** **CLÁUSULA DE DESTAQUE — RETENÇÃO ESCALONADA.** Como a reserva é de dia inteiro e exclusiva,
**a retenção cresce conforme a data se aproxima**, chegando à totalidade do valor em cancelamentos com
menos de 48 horas ou em caso de não comparecimento. **A retenção nunca supera o valor já pago** — não
há cobrança adicional após o cancelamento.

**4.3.** **Se a sua data for revendida** a outro grupo depois do cancelamento, devolvemos o valor
retido, descontada apenas a taxa administrativa.

**4.4.** Antes de cancelar, você pode **remarcar a data** ou **transferir a reserva para outra pessoa**,
nas condições da Política de Cancelamento.

**4.5.** Antes de confirmar qualquer cancelamento, o aplicativo mostra **exatamente quanto você recebe
de volta**.

**4.6.** **Cancelamento pelo guia, ou por condição climática ou determinação de autoridade**, dá a você
o direito de escolher entre **nova data ou reembolso integral**, sem retenção.

**4.7.** Reembolsos são feitos pelo mesmo meio de pagamento. O prazo de crédito depende do seu banco ou
da bandeira do cartão.

**4.8.** Nos termos do art. 49 do Código de Defesa do Consumidor, você pode **desistir da contratação
em até 7 (sete) dias** contados da reserva feita pelo aplicativo, com devolução integral, **desde que a
data da pescaria ainda não tenha ocorrido**.

## 5. Participantes da pescaria

**5.1.** Ao cadastrar os participantes, **você declara ter autorização de cada um deles** para informar
nome e telefone à plataforma e ao guia.

**5.2.** Esses dados são usados apenas para organizar a pescaria e para contato em caso de emergência.

**5.3.** Você é responsável por transmitir aos participantes as orientações de segurança e o termo de
responsabilidade.

## 6. Segurança e termo de responsabilidade

**6.1.** **CLÁUSULA DE DESTAQUE — RISCOS DA ATIVIDADE.** Pescaria embarcada envolve riscos inerentes:
embarque e desembarque, condições da água e do tempo, manuseio de anzóis e equipamentos, exposição
solar e contato com animais aquáticos.

**6.2.** A cada reserva você aceita um **Termo de Responsabilidade** específico, com registro de data,
hora e IP.

**6.3.** Você se compromete a **seguir as instruções do guia**, usar os equipamentos de segurança e não
embarcar sob efeito de álcool ou substâncias que comprometam sua capacidade — hipótese em que o guia
pode recusar o embarque **sem direito a reembolso**.

**6.4.** Informe ao guia, com antecedência, condições de saúde relevantes (cardíacas, gestação,
mobilidade reduzida, alergias).

## 7. Fotos, capturas e localização

**7.1.** Ao publicar uma foto de captura, você concede à plataforma **licença não exclusiva e gratuita**
para exibi-la no aplicativo, no feed, em rankings e em material de divulgação, sempre com seu nome de
usuário.

**7.2.** As fotos publicadas recebem **marca d'água do aplicativo** e são exibidas com espécie, peso,
data e **nome da região** da captura.

**7.3.** **A localização exata da captura não é pública.** Ela é registrada e fica visível apenas para
membros do plano Diamond, na Área Diamond. Você pode ocultar o ponto ao publicar.

**7.4.** Você garante que a foto é sua e que não viola direitos de terceiros, e se compromete a
respeitar a legislação de pesca — incluindo tamanhos mínimos, cotas, espécies protegidas e períodos de
defeso.

**7.5.** Podemos remover conteúdo ilegal, ofensivo, enganoso ou que exponha terceiros sem autorização.

## 8. Conduta

É proibido: criar contas falsas; publicar conteúdo ofensivo, discriminatório ou ilegal; assediar outros
usuários ou guias; usar o aplicativo para anunciar serviços concorrentes; tentar acessar dados de
outros usuários; e usar meios automatizados para extrair dados da plataforma.

## 9. Plano Diamond

**9.1.** O plano Diamond é uma **assinatura anual** que dá acesso à Área Diamond, com localização exata
das capturas, mapa de calor dos pontos, detalhes técnicos, abertura antecipada de datas e descontos
oferecidos por guias participantes.

**9.2.** **O Diamond é contratado fora do aplicativo**, diretamente com a plataforma, e ativado por
ela.

**9.3.** O plano **não tem renovação automática**. Enviaremos avisos antes do vencimento; encerrado o
prazo, o acesso à Área Diamond cessa e o aplicativo volta a exibir apenas o nome da região.

**9.4.** O desconto Diamond é **opcional para cada guia** e pode não estar disponível em todas as
reservas.

**9.5.** As informações da Área Diamond são para **uso pessoal**. É vedado republicá-las, revendê-las
ou distribuí-las fora do aplicativo.

## 10. Seus dados pessoais

**10.1.** Tratamos seus dados conforme a **Política de Privacidade** e a Lei nº 13.709/2018 (LGPD).

**10.2.** Compartilhamos com o **guia** o necessário para a pescaria (nome, contato e participantes) e
com o **Mercado Pago** o necessário para processar o pagamento.

**10.3.** Você pode, a qualquer momento, **acessar, corrigir ou excluir** seus dados e **descadastrar-se
dos avisos** de captura pelo próprio aplicativo, sem prejuízo dos dados que precisamos manter por
obrigação legal ou fiscal.

**10.4.** Avisos essenciais da sua reserva (confirmação, cobrança, lembrete, cancelamento) **não podem
ser desativados** enquanto houver reserva ativa.

## 11. Disponibilidade e limitação de responsabilidade

**11.1.** Trabalhamos para manter o aplicativo disponível, mas ele pode passar por manutenção ou
indisponibilidade temporária.

**11.2.** **CLÁUSULA DE DESTAQUE.** A plataforma responde pelos serviços que efetivamente presta —
intermediação, agenda e processamento de pagamento. **Não responde pela execução da pescaria nem por
danos ocorridos durante o passeio**, que são de responsabilidade do guia, **sem prejuízo dos direitos
assegurados ao consumidor pelo Código de Defesa do Consumidor**.

## 12. Alterações destes termos

**12.1.** Podemos atualizar este documento. A nova versão é apresentada no aplicativo e **exige novo
aceite**.

**12.2.** Suas reservas já confirmadas continuam regidas pela versão aceita à época.

**12.3.** Cada aceite é registrado com **data, hora, IP, dispositivo, versão e código de verificação do
texto aceito**.

## 13. Contato e foro

**13.1.** Suporte: **[E-MAIL]** · **[TELEFONE/WHATSAPP]**.

**13.2.** Aplica-se a legislação brasileira. Como consumidor, você pode ajuizar ação **no foro do seu
domicílio**.

---

*Versão 1.0 — vigente desde [DATA]. Ao assinalar a caixa de aceite no cadastro, você declara ter lido,
compreendido e concordado com estes termos.*$doc$)
on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;

-- politica-cancelamento.md  (sha256 ee19fe2baa845d0d100bf8d51aad8749d47be357e31c6b58a887561d51919bc7)
insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
values ('politica_cancelamento', '1.0', $doc$Política de Cancelamento e Reembolso$doc$, $doc$> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Precisa de revisão por advogado antes de entrar em produção.
> É a peça de maior risco jurídico do aplicativo: trata de retenção de valores em relação de consumo.
> Os percentuais abaixo são configuráveis no painel e devem ser validados com o jurídico.

# Política de Cancelamento e Reembolso

Esta política é apresentada a você **antes do pagamento** e aceita junto com a reserva. Ela vale tanto
para o pescador quanto para o guia.

---

## 1. Por que existe uma escala de retenção

A reserva é de **dia inteiro e exclusiva**. Quando você reserva uma data, ela sai do mercado: o guia
deixa de vendê-la a outro grupo e organiza equipe, combustível, isca e logística. Quanto mais perto da
data, menor a chance de a vaga ser revendida — e maior o prejuízo de quem se preparou.

Por isso a retenção **cresce conforme a data se aproxima**. Ela não é punição: é a estimativa do
prejuízo real, prefixada em contrato, como permitem os arts. 418 a 420 do Código Civil.

## 2. Escala de retenção — cancelamento pelo pescador

Os prazos são contados em dias corridos até a data da pescaria.

| Quando você cancela | Retenção | Você recebe de volta |
|---|---|---|
| **30 dias ou mais** antes | Apenas a taxa administrativa (**[5%]**) | 95% do valor pago |
| **15 a 29 dias** antes | **[25%]** do valor da reserva | o restante do que foi pago |
| **7 a 14 dias** antes | **[50%]** do valor da reserva | o restante do que foi pago |
| **3 a 6 dias** antes | **[75%]** do valor da reserva | o restante do que foi pago |
| **Menos de 48 horas** antes, ou não comparecimento | **[100%]** do valor da reserva | nada |

**Duas regras que protegem você:**

**2.1. A retenção nunca supera o que você já pagou.** Não haverá cobrança adicional depois do
cancelamento. Se você pagou apenas o sinal, o máximo que pode perder é o sinal.

**2.2. Se a data for revendida, você recebe mais de volta.** Cancelando, sua data volta para a lista de
espera. **Se outro grupo fechar a mesma data e a mesma embarcação, devolvemos o valor retido,
descontada apenas a taxa administrativa** — porque, nesse caso, o prejuízo não se concretizou. A
devolução é automática, em até **[7]** dias após a confirmação da nova reserva.

## 3. Alternativas antes de cancelar

Cancelar quase nunca é a melhor saída. Antes disso, o aplicativo oferece:

**3.1. Remarcar a data.** Solicitando com **[15]** dias ou mais de antecedência, você pode transferir a
reserva para outra data disponível do mesmo guia, **uma vez, sem custo**. Havendo diferença de preço,
ela é cobrada ou devolvida.

**3.2. Transferir a reserva para outra pessoa.** Até **[48 horas]** antes, sem custo, desde que o novo
titular aceite os termos e o termo de responsabilidade no aplicativo.

**3.3. Reduzir o número de participantes.** Até o prazo de quitação, com ajuste proporcional da parcela
por passageiro. O valor da embarcação não é reduzido.

## 4. Direito de arrependimento (7 dias)

Nos termos do **art. 49 do Código de Defesa do Consumidor**, por se tratar de contratação fora do
estabelecimento comercial, você pode **desistir em até 7 (sete) dias corridos** contados da reserva,
**com devolução integral de tudo o que pagou, inclusive a taxa administrativa**.

Esse direito prevalece sobre a escala da cláusula 2 e vale **desde que a pescaria ainda não tenha
ocorrido**. Reservas feitas a menos de 7 dias da data mantêm o direito até o momento do embarque.

## 5. Cancelamento pelo guia, clima e força maior

**5.1.** Se **o guia cancelar** por qualquer motivo que não seja clima ou determinação de autoridade,
você escolhe entre **nova data** ou **reembolso integral**, sem nenhuma retenção. O guia ainda responde
perante a plataforma pela penalidade prevista no contrato dele.

**5.2.** Se a pescaria for cancelada por **condição climática adversa, restrição de autoridade
competente, interdição do local ou outro caso fortuito ou de força maior**, você escolhe entre **nova
data** ou **reembolso integral**, sem retenção. Nenhuma das partes paga penalidade.

**5.3.** A decisão sobre condições de navegação é do guia e é **soberana**, por ser matéria de
segurança.

**5.4.** Se **você não puder ir por motivo de saúde** comprovado por atestado médico, apresentado em
até 5 dias, a retenção é reduzida a **[taxa administrativa apenas]**, e você pode optar por nova data.

## 6. Não pagamento do saldo

Não pago o saldo até a data limite da sua reserva, ela é **cancelada automaticamente** e aplica-se a
faixa da escala correspondente ao dia do vencimento. A data volta para a lista de espera, e a regra da
cláusula 2.2 continua valendo em seu favor.

## 7. Como o reembolso é feito

**7.1.** Pelo **mesmo meio de pagamento** usado na compra. Pix costuma cair em até 2 dias úteis; cartão
depende do banco emissor e pode levar até duas faturas.

**7.2.** O valor retido é dividido entre guia e plataforma na **mesma proporção da comissão** da
reserva.

**7.3.** A taxa administrativa cobre o custo do processamento do pagamento, que **não é devolvido pela
operadora** mesmo quando a compra é estornada.

## 8. Como pedir

Pelo próprio aplicativo, em **Minhas reservas → Cancelar**. Antes de confirmar, a tela mostra
**exatamente quanto você recebe de volta**. O pedido vale a partir do horário do registro no
aplicativo.

Dúvidas: **[E-MAIL]** · **[TELEFONE/WHATSAPP]**.

---

## Anexo técnico — para configuração no painel (não faz parte do texto ao cliente)

- As faixas são registradas em `cancellation_rules` e podem ter **override por guia**.
- A versão vigente é **congelada em `bookings.politica_versao`** no ato da reserva; alterações futuras não retroagem.
- A retenção é **limitada ao total efetivamente pago** (`min(retencao_calculada, total_pago)`).
- O estorno parcial no Mercado Pago devolve proporcionalmente da conta do guia e da comissão, mantendo o rateio automaticamente.
- A devolução por revenda da data (cláusula 2.2) é disparada pelo webhook de confirmação da nova reserva no mesmo `boat_id` + `data`.
- Não comparecimento é registrado pelo guia no check-in e tratado como cancelamento na faixa de menos de 48 horas.$doc$)
on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;

-- politica-privacidade.md  (sha256 99d4fd0b7fa5be4405d4951d5ecd88601cd096ed67d532a23a9ac1a86bbafa36)
insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
values ('politica_privacidade', '1.0', $doc$Política de Privacidade$doc$, $doc$> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Precisa de revisão por advogado antes de entrar em
> produção. Os campos entre colchetes devem ser preenchidos, inclusive o contato do encarregado.

# Política de Privacidade

**[NOME DA PLATAFORMA]**, CNPJ **[CNPJ]**, é a controladora dos dados pessoais tratados no aplicativo.
Esta política explica o que coletamos, por quê, com quem compartilhamos e como você controla isso.
Seguimos a Lei nº 13.709/2018 (LGPD).

---

## 1. O que coletamos

| Dado | Para quê | Base legal |
|---|---|---|
| Nome, telefone, e-mail | Criar sua conta, confirmar reservas e avisar sobre a pescaria | Execução de contrato |
| Nome e telefone dos **participantes** | Organizar o embarque e permitir contato em emergência | Execução de contrato / legítimo interesse |
| Dados de pagamento | Processar a cobrança (ficam com o Mercado Pago, não conosco) | Execução de contrato |
| Fotos de capturas e localização | Alimentar o feed e a Área Diamond | Consentimento |
| Informações de saúde que você optar por informar ao guia | Segurança durante a atividade | Proteção da vida e da incolumidade física |
| Registros de aceite (data, hora, IP, dispositivo) | Comprovar concordância com contratos e termos | Cumprimento de obrigação legal / exercício de direitos |
| Token do aparelho | Enviar notificações | Execução de contrato |

**Não armazenamos o número do seu cartão.** Ele vai direto ao Mercado Pago.

## 2. Dados de terceiros que você informa

Ao cadastrar participantes, **você declara ter autorização deles**. Usamos esses dados apenas para
organizar a pescaria e para contato em emergência — nunca para marketing. Qualquer participante pode
pedir a exclusão dos próprios dados pelo contato no fim desta política.

## 3. Com quem compartilhamos

- **O guia da sua reserva** — nome, contato e lista de participantes, para executar a pescaria. O contrato dele proíbe usar esses dados para outra finalidade.
- **Mercado Pago** — dados necessários ao pagamento.
- **Provedores de mensagem** (SMS, e-mail e notificação) — apenas o destinatário e o conteúdo da mensagem.
- **Autoridades**, quando houver requisição legal.

Não vendemos dados pessoais. Não compartilhamos sua base de contatos com outros guias.

## 4. Localização das capturas

A coordenada exata de uma captura é registrada quando você publica uma foto, e **não é pública**. Ela
fica visível apenas para membros do plano Diamond, dentro do aplicativo. Ao publicar, você pode
**ocultar o ponto**. As fotos são reprocessadas no envio para **remover os metadados de GPS do arquivo**.

## 5. Notificações

Avisos essenciais da sua reserva — confirmação, cobrança, lembrete, cancelamento — **não podem ser
desativados** enquanto houver reserva ativa: são parte da execução do contrato.

Já os **alertas de captura de outros pescadores** dependem de consentimento e podem ser desligados a
qualquer momento no seu perfil, sem afetar o resto.

## 6. Por quanto tempo guardamos

- **Conta e reservas:** enquanto a conta existir e, depois, pelo prazo exigido pela legislação fiscal e civil (até 5 anos).
- **Registros de aceite:** enquanto puderem ser necessários para exercício de direitos.
- **Fotos e capturas:** até você excluí-las.
- **Logs de notificação:** 12 meses.

## 7. Seus direitos

Você pode, a qualquer momento: confirmar que tratamos seus dados; acessá-los; corrigi-los; pedir
anonimização, bloqueio ou eliminação de dados desnecessários; pedir portabilidade; revogar
consentimento; e saber com quem compartilhamos.

Boa parte disso está no próprio aplicativo, em **Perfil → Meus dados**. O que não estiver, peça pelo
contato abaixo — respondemos em até **15 dias**.

**A exclusão da conta não apaga** o que a lei exige que seja mantido: registros fiscais de reservas
pagas e registros de aceite de contratos.

## 8. Segurança

Dados trafegam cifrados. O acesso é restrito por permissões no banco: **um guia não alcança dados de
outro guia**, e as credenciais de pagamento dos guias são acessíveis apenas aos serviços internos,
nunca ao aplicativo.

Em caso de incidente de segurança relevante, comunicaremos você e a ANPD nos termos da LGPD.

## 9. Crianças e adolescentes

O aplicativo é destinado a **maiores de 18 anos**. Menores participam de pescarias acompanhados de
responsável legal, e não criam conta própria.

## 10. Alterações

Podemos atualizar esta política. A nova versão é apresentada no aplicativo e **exige novo aceite**,
registrado com data, hora, IP e código de verificação do texto.

## 11. Contato

Encarregado pelo tratamento de dados (DPO): **[NOME]** — **[E-MAIL]**
Suporte: **[E-MAIL]** · **[TELEFONE/WHATSAPP]**

---

*Versão 1.0 — vigente desde [DATA].*$doc$)
on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;

-- termo-responsabilidade.md  (sha256 7ba09dd0dda3db3738506cd7597c5ae091fc08fe4830889b1e288de89816531b)
insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
values ('termo_responsabilidade', '1.0', $doc$Termo de Ciência de Risco e Responsabilidade$doc$, $doc$> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Precisa de revisão por advogado antes de entrar em
> produção. É aceito a cada reserva, e é o aceite por pescaria que tem valor probatório.

# Termo de Ciência de Risco e Responsabilidade

Você está prestes a participar de uma **pescaria embarcada**. Leia antes de confirmar.

---

## 1. Riscos da atividade

**CLÁUSULA DE DESTAQUE.** Pescaria embarcada é atividade em ambiente natural, sujeita a riscos que
não podem ser inteiramente eliminados, entre eles:

- embarque, desembarque e deslocamento em piso molhado ou instável;
- mudança repentina de clima, vento, ondas e correnteza;
- manuseio de anzóis, alicates, facas e demais equipamentos de pesca;
- contato com peixes que possuem esporões, dentes ou ferrões;
- exposição prolongada ao sol, calor, desidratação e insetos;
- distância de atendimento médico imediato.

Ao aceitar este termo, você declara **conhecer e assumir esses riscos**.

## 2. Suas obrigações durante a pescaria

**2.1.** Seguir as **instruções do guia**, que é a autoridade a bordo em tudo que diga respeito à
segurança e à navegação.

**2.2.** Usar **colete salva-vidas** sempre que o guia determinar, e obrigatoriamente durante o
deslocamento.

**2.3.** **Não embarcar sob efeito de álcool** ou de substâncias que reduzam sua capacidade de reação.
O guia pode recusar o embarque nessa hipótese, **sem direito a reembolso**.

**2.4.** Não sobrecarregar a embarcação nem exceder a lotação informada.

**2.5.** Respeitar a **legislação de pesca**: espécies permitidas, tamanhos mínimos, cotas e período
de defeso. Multas e sanções por infração são de responsabilidade de quem as praticou.

**2.6.** Não deixar resíduos na água ou na margem.

## 3. Declaração de saúde

**3.1.** Você declara estar em condições de saúde compatíveis com a atividade.

**3.2.** Compromete-se a informar ao guia, **antes do embarque**, condições relevantes: problemas
cardíacos ou respiratórios, gestação, epilepsia, mobilidade reduzida, alergias graves, uso de
medicação contínua e incapacidade de nadar.

**3.3.** Essa informação é usada exclusivamente para a segurança do grupo e para orientar o
atendimento em caso de emergência.

## 4. Participantes e menores de idade

**4.1.** Você é responsável por transmitir este termo a **todos os participantes** que cadastrou e por
garantir que estejam cientes dos riscos e das regras.

**4.2.** **Menores de 18 anos** só embarcam acompanhados dos pais ou responsável legal, que responde
integralmente por eles durante a atividade.

## 5. Equipamentos e pertences

**5.1.** Equipamentos pessoais — varas, carretilhas, celulares, câmeras — são levados **por sua conta
e risco**. Perda, queda na água ou dano não geram indenização.

**5.2.** Dano causado por você, dolosa ou culposamente, a equipamento ou à embarcação do guia é de sua
responsabilidade.

## 6. Emergência e evacuação

Em situação de emergência, você se compromete a seguir integralmente as instruções da tripulação e a
colaborar com eventual manobra de evacuação ou retorno antecipado. **O retorno antecipado por motivo
de segurança não gera direito a reembolso proporcional**, salvo se determinado antes do início da
atividade — caso em que se aplica a Política de Cancelamento.

## 7. Responsabilidades

**7.1.** A execução da pescaria e a segurança a bordo são de **responsabilidade do guia**, que declara
manter embarcação regularizada, habilitação válida e equipamentos de segurança em dia.

**7.2.** A plataforma atua como **intermediadora** da reserva e do pagamento, **sem prejuízo dos
direitos assegurados ao consumidor pelo Código de Defesa do Consumidor**.

**7.3.** Este termo **não exclui** a responsabilidade do guia ou da plataforma por dolo, negligência
grave ou descumprimento de dever legal — o que a lei brasileira não permite afastar por contrato.

## 8. Imagem

Você autoriza o uso de imagens feitas durante a pescaria para divulgação no aplicativo e nos canais da
plataforma e do guia. **Essa autorização pode ser revogada a qualquer tempo** pelo suporte, com
remoção das imagens em que você apareça.

---

*Versão 1.0 — vigente desde [DATA]. Ao marcar a caixa de aceite, você declara ter lido e compreendido
este termo, e assumir os riscos aqui descritos. O aceite é registrado com data, hora, endereço IP,
dispositivo e código de verificação do texto.*$doc$)
on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;


-- =============================================================================
-- Endurecimento específico do Supabase
--
-- O Supabase concede acesso a novas tabelas por privilégio padrão. Como neste
-- aplicativo nada é visível sem login, o papel anônimo não deve alcançar
-- tabela nenhuma. Sem isto, uma tabela criada no futuro nasceria legível para
-- qualquer pessoa com a chave pública do projeto.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;

-- Confirmação rápida do que foi criado.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas,
  (select count(*) from pg_policies where schemaname = 'public')  as politicas,
  (select count(*) from public.app_settings)                      as configuracoes,
  (select count(*) from public.cancellation_rules)                as faixas_cancelamento,
  (select count(*) from public.legal_documents)                   as documentos_legais;
