-- =============================================================================
-- Cache de previsão no servidor
--
-- O PROBLEMA QUE ISTO RESOLVE.
--
-- Até aqui cada celular falava direto com o provedor de previsão. Dez
-- pescadores olhando Jurujuba na manhã de sábado eram dez chamadas do MESMO
-- dado — e o número cresce com os usuários, que é exatamente a direção errada.
--
-- Com o cache, uma previsão é buscada UMA vez por ponto por hora e servida a
-- todo mundo do banco. O custo passa a crescer com o número de PONTOS DE PESCA,
-- não de pessoas: um ponto custa ~24 chamadas por dia, tenha ele um usuário ou
-- dez mil.
--
-- Isso muda três coisas de uma vez:
--   · qualquer plano do provedor, gratuito ou pago, passa a sobrar;
--   · trocar de provedor vira mexer numa função, não no aplicativo;
--   · a tela abre instantânea, porque o dado já está aqui.
--
-- O QUE FICA GUARDADO É A RESPOSTA CRUA DO PROVEDOR, e não a versão traduzida.
-- Assim, mudar a tradução amanhã não invalida o que já está guardado — e um
-- defeito de tradução pode ser corrigido sem esperar o cache vencer.
--
-- NÃO HÁ DADO PESSOAL AQUI. É previsão do tempo de coordenadas de operações
-- públicas. Por isso a leitura é liberada para quem está logado, sem RLS por
-- dono: esconder isso não protegeria ninguém e obrigaria a uma função a mais.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.previsoes (
  -- 'lat,lng' com 3 casas: ~100 m, que é o mesmo ponto para efeito de previsão.
  -- Chave mais fina multiplicaria as buscas sem mudar um número na tela.
  chave             text primary key,
  lat               double precision not null,
  lng               double precision not null,
  buscado_em        timestamptz not null default now(),
  fonte             text not null,
  tem_dados_de_mar  boolean not null default false,
  -- { "tempo": <resposta crua>, "mar": <resposta crua ou null> }
  dados             jsonb not null
);

create index if not exists previsoes_buscado_em on public.previsoes (buscado_em);

alter table public.previsoes enable row level security;

drop policy if exists previsoes_leitura on public.previsoes;
create policy previsoes_leitura on public.previsoes
  for select to authenticated using (true);

-- Escrita só pela função do servidor. Se o aplicativo pudesse gravar aqui,
-- qualquer pessoa logada poderia envenenar a previsão que todos os outros veem
-- — inclusive apagando um alerta de trovoada.
revoke insert, update, delete on public.previsoes from authenticated, anon;
grant select on public.previsoes to authenticated;

comment on table public.previsoes is
  'Previsão crua por ponto, buscada uma vez por hora pelo servidor e servida a todos.';


-- -----------------------------------------------------------------------------
-- Limpeza: ponto que ninguém consulta mais não precisa ficar guardado.
--
-- Chamada pelo robô 9, junto com o resto da manutenção.
-- -----------------------------------------------------------------------------
create or replace function public.limpar_previsoes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  -- Uma semana sem atualização significa que nenhum guia e nenhum cliente
  -- olharam aquele ponto nesse tempo. Previsão velha não serve nem de história.
  delete from public.previsoes where buscado_em < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.limpar_previsoes() from public, anon, authenticated;
