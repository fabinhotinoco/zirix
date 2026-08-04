-- =============================================================================
-- Anúncios de parceiros: quatro espaços, configurados pelo master
--
-- Segunda fonte de renda, independente da comissão das pescarias. O master
-- cadastra quatro links de loja de equipamento, cada um com o código de
-- desconto negociado; quem compra pelo aplicativo ganha o desconto e a
-- plataforma ganha a comissão de afiliado.
--
-- QUATRO ESPAÇOS FIXOS, e não uma lista que cresce. A restrição é de propósito:
-- espaço de anúncio sem limite vira um mural, e um mural empurra a pescaria —
-- que é o produto — para fora da tela. Quatro cabem numa dobra e obrigam a
-- escolher os melhores parceiros.
--
-- O clique é contado POR DIA, sem quem clicou. Para decidir qual parceiro
-- manter basta saber o que funciona; guardar quem clicou em anúncio de vara de
-- pesca é coletar hábito de consumo de terceiro sem precisar. A conferência do
-- dinheiro é feita no painel do parceiro, não aqui.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.anuncios (
  id              uuid primary key default gen_random_uuid(),
  -- Um espaço por posição: trocar o parceiro do lugar 2 é editar a linha 2.
  posicao         smallint not null unique check (posicao between 1 and 4),
  titulo          text not null,
  chamada         text,
  /* Quem de fato vende. Aparece no cartão porque a compra é feita fora daqui, e
     o art. 36 do CDC exige que publicidade seja identificável como tal. */
  parceiro        text not null,
  -- Só https, com domínio público. `javascript:` na versão web é execução de
  -- código; `http://` o iOS bloqueia e o botão morre sem explicar nada.
  url             text not null check (url ~ '^https://[^/@:]+\.[^/@:]+'),
  codigo_desconto text,
  ativo           boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.anuncio_cliques (
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  dia        date not null default current_date,
  cliques    integer not null default 0,
  primary key (anuncio_id, dia)
);

alter table public.anuncios        enable row level security;
alter table public.anuncio_cliques enable row level security;

-- Anúncio desligado é rascunho do master: ninguém mais precisa vê-lo.
drop policy if exists anuncios_leitura on public.anuncios;
create policy anuncios_leitura on public.anuncios
  for select to authenticated
  using (ativo or public.is_master());

drop policy if exists anuncios_escrita_master on public.anuncios;
create policy anuncios_escrita_master on public.anuncios
  for all to authenticated
  using (public.is_master())
  with check (public.is_master());

-- A contagem é do master. O aplicativo só soma, pela função abaixo.
drop policy if exists cliques_leitura_master on public.anuncio_cliques;
create policy cliques_leitura_master on public.anuncio_cliques
  for select to authenticated
  using (public.is_master());

revoke all on public.anuncios        from anon;
revoke all on public.anuncio_cliques from anon;
grant select, insert, update, delete on public.anuncios to authenticated;
grant select on public.anuncio_cliques to authenticated;

create or replace function public.anuncios_tocados()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists anuncios_tocados on public.anuncios;
create trigger anuncios_tocados
  before update on public.anuncios
  for each row execute function public.anuncios_tocados();


-- -----------------------------------------------------------------------------
-- Contar um clique.
--
-- Função, e não `insert` do aplicativo, porque a contagem não pode ser escrita
-- à mão: com permissão de escrita na tabela, qualquer pessoa inflaria o número
-- do anúncio que quisesse — e é por esse número que se decide qual parceiro
-- fica. Aqui só dá para somar um, e só em anúncio que está no ar.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_clique(p_anuncio uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;  -- contagem é estatística, não é motivo para derrubar a tela
  end if;

  insert into public.anuncio_cliques (anuncio_id, dia, cliques)
  select p_anuncio, current_date, 1
    from public.anuncios a
   where a.id = p_anuncio and a.ativo
  on conflict (anuncio_id, dia) do update
    set cliques = public.anuncio_cliques.cliques + 1;
end;
$$;

revoke all on function public.registrar_clique(uuid) from public, anon;
grant execute on function public.registrar_clique(uuid) to authenticated;

comment on function public.registrar_clique(uuid) is
  'Soma um clique no dia de hoje. Sem quem clicou: para decidir qual parceiro fica, basta saber o que funciona.';


-- -----------------------------------------------------------------------------
-- Como cada espaço está rendendo, para o master.
-- -----------------------------------------------------------------------------
create or replace function public.desempenho_dos_anuncios(p_dias integer default 30)
returns table (
  posicao   smallint,
  titulo    text,
  parceiro  text,
  ativo     boolean,
  cliques   bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.posicao, a.titulo, a.parceiro, a.ativo,
         coalesce(sum(c.cliques) filter (
           where c.dia > current_date - greatest(coalesce(p_dias, 30), 1)
         ), 0)
    from public.anuncios a
    left join public.anuncio_cliques c on c.anuncio_id = a.id
   where public.is_master()
   group by a.posicao, a.titulo, a.parceiro, a.ativo
   order by a.posicao;
$$;

revoke all on function public.desempenho_dos_anuncios(integer) from public, anon;
grant execute on function public.desempenho_dos_anuncios(integer) to authenticated;
