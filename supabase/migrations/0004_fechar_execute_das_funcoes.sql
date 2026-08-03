-- =============================================================================
-- Fecha a execução das funções privilegiadas
--
-- O Postgres concede EXECUTE a PUBLIC em toda função nova, e o Supabase publica
-- o schema `public` como API REST. Junto, isso significa que cada função deste
-- projeto virou um endereço chamável — inclusive sem login, em
-- /rest/v1/rpc/<nome>. Nenhuma delas foi feita para isso.
--
-- O caso com dano concreto é `is_diamond(uuid)`: ela aceita o identificador de
-- outra pessoa. Aberta ao papel anônimo, qualquer um podia perguntar "fulano é
-- assinante Diamond?" e receber a resposta — sobre quem paga, sem estar logado.
--
-- O que cada grupo precisa, e por quê:
--
--   gatilhos          ninguém precisa chamar. O Postgres não exige EXECUTE do
--                     usuário para disparar um gatilho — quem dispara é a
--                     tabela. Revogar de todos não quebra nada.
--
--   is_master         usadas DENTRO das políticas de RLS, que são avaliadas com
--   is_guide_owner    o papel de quem consulta. Aqui o EXECUTE é necessário
--                     para `authenticated`, senão toda consulta passa a falhar
--                     com "permission denied for function". Fecha só para o
--                     anônimo.
--
--   is_diamond        chamada dentro de v_catches_feed. Uma view SECURITY
--                     DEFINER empresta a permissão das TABELAS, mas não a de
--                     FUNÇÃO: essa continua sendo checada contra quem consulta.
--                     Fechá-la para `authenticated` derruba o feed inteiro —
--                     confirmado pelo teste, que quebrou na primeira tentativa
--                     com "permission denied for function is_diamond".
--
--                     Então o vazamento é fechado por dentro: a função passa a
--                     responder só sobre quem pergunta. Perguntar por outra
--                     pessoa devolve falso, e não a verdade sobre a assinatura
--                     dela. O master continua enxergando tudo, porque precisa
--                     para gerir os membros.
--
-- Idempotente.
-- =============================================================================

-- --- Funções de gatilho: fechadas para todo mundo ----------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- --- Auxiliares de política: fechadas para o anônimo -------------------------
revoke all on function public.is_master()             from public, anon;
revoke all on function public.is_guide_owner(uuid)    from public, anon;
grant execute on function public.is_master()          to authenticated;
grant execute on function public.is_guide_owner(uuid) to authenticated;

-- --- is_diamond: fechada para o anônimo e sem responder sobre terceiros ------
create or replace function public.is_diamond(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid
      and plano = 'diamond'
      and status = 'ativa'
      and fim >= current_date
  )
  -- A pergunta só é respondida sobre quem pergunta. Sem esta linha, qualquer
  -- pessoa logada descobre pelo endereço /rest/v1/rpc/is_diamond quem são os
  -- assinantes — informação sobre quem paga.
  and (uid = auth.uid() or public.is_master());
$$;

revoke all on function public.is_diamond(uuid) from public, anon;
grant execute on function public.is_diamond(uuid) to authenticated;

-- --- Daqui para frente, função nova não nasce aberta -------------------------
-- Sem isto, a próxima função criada repete o problema em silêncio.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
