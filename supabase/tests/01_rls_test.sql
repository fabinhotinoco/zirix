-- =============================================================================
-- Testes de RLS — as duas garantias que sustentam a plataforma:
--   1. Guia nenhum enxerga dado de outro guia.
--   2. A coordenada da captura não sai para quem não é Diamond.
--
-- Cada bloco falha ruidosamente (raise exception) se a garantia não se cumprir.
-- Rodar com: psql -d zirix -v ON_ERROR_STOP=1 -f 01_rls_test.sql
-- =============================================================================

\set QUIET on
set client_min_messages to notice;

-- --- massa de teste (como service_role, ignorando RLS) -----------------------
set role postgres;

truncate auth.users cascade;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'master@teste'),
  ('00000000-0000-0000-0000-0000000000b1', 'guiaA@teste'),
  ('00000000-0000-0000-0000-0000000000b2', 'guiaB@teste'),
  ('00000000-0000-0000-0000-0000000000c1', 'cliente@teste'),
  ('00000000-0000-0000-0000-0000000000c2', 'diamond@teste');

insert into public.profiles (id, nome, role) values
  ('00000000-0000-0000-0000-0000000000aa', 'Master',        'master'),
  ('00000000-0000-0000-0000-0000000000b1', 'Guia A',        'guia'),
  ('00000000-0000-0000-0000-0000000000b2', 'Guia B',        'guia'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cliente Comum', 'cliente'),
  ('00000000-0000-0000-0000-0000000000c2', 'Cliente Diamond','cliente');

insert into public.guides (id, user_id, nome_operacao, status, comissao_percentual,
                           mp_access_token, mp_conectado_em)
values
  -- Guia A está pronto: aprovado e com conta de recebimento conectada.
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
   'Pesca Vertical', 'aprovado', 10, 'TOKEN-SECRETO-A', now()),
  -- Guia B está aprovado, mas ainda NÃO conectou o Mercado Pago.
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2',
   'Pescaria do Zé', 'aprovado', 12, 'TOKEN-SECRETO-B', null);

insert into public.boats (id, guide_id, nome, capacidade_max) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Barco A', 4),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Barco B', 6);

insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values
  ('20000000-0000-0000-0000-00000000000a', current_date + 30, 60000, 15000),
  ('20000000-0000-0000-0000-00000000000b', current_date + 30, 80000, 10000);

-- Reserva do cliente com o guia A: total 1.000, comissão 10%, sinal 30%.
insert into public.bookings (
  id, codigo, user_id, guide_id, boat_id, data, qtd_pescadores,
  preco_barco_centavos, preco_passageiro_centavos, valor_total_centavos,
  comissao_percentual, comissao_centavos, repasse_guia_centavos,
  sinal_centavos, saldo_centavos, status, status_pagamento
) values (
  '30000000-0000-0000-0000-00000000000a', 'PV-2026-0001',
  '00000000-0000-0000-0000-0000000000c1',
  '10000000-0000-0000-0000-00000000000a',
  '20000000-0000-0000-0000-00000000000a',
  current_date + 30, 4,
  40000, 15000, 100000,
  10, 10000, 90000,
  30000, 70000, 'confirmada', 'sinal_pago'
);

insert into public.ledger_entries (tipo, booking_id, guide_id, valor_bruto_centavos, comissao_centavos, repasse_centavos)
values ('comissao_passeio', '30000000-0000-0000-0000-00000000000a',
        '10000000-0000-0000-0000-00000000000a', 30000, 3000, 27000);

-- Assinatura Diamond ativa só para o cliente Diamond.
insert into public.subscriptions (user_id, fim) values
  ('00000000-0000-0000-0000-0000000000c2', current_date + 300);

-- Uma captura com coordenada exata.
insert into public.catches (id, user_id, guide_id, foto_path, especie, peso_kg,
                            regiao_nome, lat, lng, isca, profundidade_m)
values ('40000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000c1',
        '10000000-0000-0000-0000-00000000000a',
        'capturas/foto1.jpg', 'Tucunaré', 4.250,
        'Represa de Furnas - setor norte', -20.6667, -46.3167, 'Hélice', 3.5);

\set QUIET off

-- =============================================================================
do $$ begin raise notice '--- 1. Guia A não pode ver NADA do guia B ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000b1');

do $$
declare n integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  select count(*) into n from public.bookings
   where guide_id = '10000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FALHA: guia A viu % reserva(s) do guia B', n; end if;

  select count(*) into n from public.ledger_entries
   where guide_id = '10000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FALHA: guia A viu o extrato do guia B'; end if;

  select count(*) into n from public.boats
   where guide_id = '10000000-0000-0000-0000-00000000000b'
     and status <> 'ativo';
  if n <> 0 then raise exception 'FALHA: guia A viu barco inativo do guia B'; end if;

  raise notice 'ok  guia A não enxerga reservas, extrato nem barcos privados do guia B';
end $$;

-- A própria reserva ele vê.
do $$
declare n integer;
begin
  select count(*) into n from public.bookings
   where guide_id = '10000000-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'FALHA: guia A deveria ver a própria reserva, viu %', n; end if;
  raise notice 'ok  guia A enxerga a própria reserva';
end $$;

-- E não alcança o token do Mercado Pago de ninguém, nem o dele.
do $$
begin
  begin
    perform mp_access_token from public.guides limit 1;
    raise exception 'FALHA: token do Mercado Pago ficou legível pelo app';
  exception when insufficient_privilege then
    raise notice 'ok  coluna mp_access_token inacessível para authenticated';
  end;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 2. Cliente comum não recebe a coordenada ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare r record;
begin
  select * into r from public.v_catches_feed
   where id = '40000000-0000-0000-0000-00000000000a';

  if r.lat is not null or r.lng is not null then
    raise exception 'FALHA: cliente comum recebeu coordenada (% , %)', r.lat, r.lng;
  end if;
  if r.isca is not null or r.profundidade_m is not null then
    raise exception 'FALHA: cliente comum recebeu dados técnicos do Diamond';
  end if;
  if r.regiao_nome is null then
    raise exception 'FALHA: cliente comum deveria ver o nome da região';
  end if;
  raise notice 'ok  feed devolve região, mas anula lat/lng/isca/profundidade';
end $$;

-- E não consegue contornar lendo a tabela direto.
do $$
begin
  begin
    perform lat from public.catches limit 1;
    raise exception 'FALHA: catches ficou legível direto — Diamond seria contornável';
  exception when insufficient_privilege then
    raise notice 'ok  select direto em catches negado';
  end;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 3. Diamond ativo recebe a coordenada ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');

do $$
declare r record;
begin
  select * into r from public.v_catches_feed
   where id = '40000000-0000-0000-0000-00000000000a';
  if r.lat is null or r.lng is null then
    raise exception 'FALHA: Diamond ativo não recebeu a coordenada';
  end if;
  if r.isca is null then
    raise exception 'FALHA: Diamond ativo não recebeu os dados técnicos';
  end if;
  raise notice 'ok  Diamond recebe lat/lng e dados técnicos';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 4. Diamond vencido perde o acesso sozinho ---'; end $$;
-- =============================================================================
begin;
set role postgres;
-- inicio também recua: o banco recusa fim anterior a inicio, e com razão.
update public.subscriptions
   set inicio = current_date - 400, fim = current_date - 1
 where user_id = '00000000-0000-0000-0000-0000000000c2';

select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');

do $$
declare r record;
begin
  select * into r from public.v_catches_feed
   where id = '40000000-0000-0000-0000-00000000000a';
  if r.lat is not null then
    raise exception 'FALHA: assinatura vencida ainda entrega coordenada';
  end if;
  raise notice 'ok  vencida a assinatura, o acesso cai sem job nenhum';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 5. Dono da captura vê sempre os próprios dados ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare r record;
begin
  select * into r from public.v_minhas_capturas
   where id = '40000000-0000-0000-0000-00000000000a';
  if r.lat is null then
    raise exception 'FALHA: dono da captura não vê a própria coordenada';
  end if;
  raise notice 'ok  dono vê a própria coordenada mesmo sem ser Diamond';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 6. Cliente não altera preço nem cria reserva ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
begin
  begin
    insert into public.bookings (
      user_id, guide_id, boat_id, data, qtd_pescadores,
      preco_barco_centavos, preco_passageiro_centavos, valor_total_centavos,
      comissao_percentual, comissao_centavos, repasse_guia_centavos,
      sinal_centavos, saldo_centavos
    ) values (
      '00000000-0000-0000-0000-0000000000c1',
      '10000000-0000-0000-0000-00000000000a',
      '20000000-0000-0000-0000-00000000000a',
      current_date + 60, 4, 100, 0, 100, 0, 0, 100, 100, 0);
    raise exception 'FALHA: cliente conseguiu criar reserva com o próprio preço';
  exception
    when insufficient_privilege then raise notice 'ok  insert de reserva negado ao cliente';
    when others then
      if sqlstate = '42501' then raise notice 'ok  insert de reserva negado ao cliente';
      else raise; end if;
  end;
end $$;

do $$
begin
  begin
    update public.boat_availability set preco_barco_centavos = 1
     where boat_id = '20000000-0000-0000-0000-00000000000a';
    if found then raise exception 'FALHA: cliente alterou o preço da agenda'; end if;
    raise notice 'ok  cliente não altera preço da agenda';
  exception when insufficient_privilege then
    raise notice 'ok  cliente não altera preço da agenda';
  end;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 7. Trava: mesmo barco, mesmo dia, uma reserva só ---'; end $$;
-- =============================================================================
begin;
set role postgres;
do $$
begin
  begin
    insert into public.bookings (
      user_id, guide_id, boat_id, data, qtd_pescadores,
      preco_barco_centavos, preco_passageiro_centavos, valor_total_centavos,
      comissao_percentual, comissao_centavos, repasse_guia_centavos,
      sinal_centavos, saldo_centavos, status
    ) values (
      '00000000-0000-0000-0000-0000000000c2',
      '10000000-0000-0000-0000-00000000000a',
      '20000000-0000-0000-0000-00000000000a',
      current_date + 30, 2, 40000, 15000, 100000,
      10, 10000, 90000, 30000, 70000, 'pendente');
    raise exception 'FALHA: o mesmo barco foi vendido duas vezes no mesmo dia';
  exception when unique_violation then
    raise notice 'ok  segunda reserva do mesmo barco/dia rejeitada pelo banco';
  end;
end $$;

-- Barco diferente, mesmo dia: tem de passar.
do $$
begin
  insert into public.bookings (
    user_id, guide_id, boat_id, data, qtd_pescadores,
    preco_barco_centavos, preco_passageiro_centavos, valor_total_centavos,
    comissao_percentual, comissao_centavos, repasse_guia_centavos,
    sinal_centavos, saldo_centavos, status
  ) values (
    '00000000-0000-0000-0000-0000000000c2',
    '10000000-0000-0000-0000-00000000000b',
    '20000000-0000-0000-0000-00000000000b',
    current_date + 30, 2, 80000, 10000, 100000,
    12, 12000, 88000, 30000, 70000, 'pendente');
  raise notice 'ok  barcos diferentes no mesmo dia convivem';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 8. Hash do documento legal é calculado sozinho ---'; end $$;
-- =============================================================================
begin;
set role postgres;
do $$
declare h1 text; h2 text;
begin
  insert into public.legal_documents (slug, versao, titulo, corpo_markdown)
  values ('contrato_cliente', 'teste-1', 'Termos', 'texto original')
  returning hash_sha256 into h1;

  if h1 is null or length(h1) <> 64 then
    raise exception 'FALHA: hash não foi calculado (valor: %)', h1;
  end if;

  update public.legal_documents set corpo_markdown = 'texto alterado'
   where slug = 'contrato_cliente' and versao = 'teste-1'
  returning hash_sha256 into h2;

  if h1 = h2 then
    raise exception 'FALHA: hash não mudou depois de editar o texto';
  end if;
  raise notice 'ok  hash calculado no insert e recalculado no update';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 9. Consistência aritmética da reserva ---'; end $$;
-- =============================================================================
begin;
set role postgres;
do $$
begin
  begin
    insert into public.bookings (
      user_id, guide_id, boat_id, data, qtd_pescadores,
      preco_barco_centavos, preco_passageiro_centavos, valor_total_centavos,
      comissao_percentual, comissao_centavos, repasse_guia_centavos,
      sinal_centavos, saldo_centavos
    ) values (
      '00000000-0000-0000-0000-0000000000c1',
      '10000000-0000-0000-0000-00000000000a',
      '20000000-0000-0000-0000-00000000000a',
      current_date + 90, 4, 40000, 15000, 100000,
      10, 10000, 90000, 30000, 60000);  -- sinal + saldo = 90.000, não 100.000
    raise exception 'FALHA: reserva com soma errada foi aceita';
  exception when check_violation then
    raise notice 'ok  banco recusa reserva cujo sinal + saldo não fecha o total';
  end;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 10. Guia não se aprova nem mexe na própria comissão ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000b1');

do $$
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  -- O ataque não precisa do aplicativo: a chave publicável e um curl bastam.
  -- O guia A já está aprovado no semeador, então a tentativa tem de mudar para
  -- um valor DIFERENTE — senão o gatilho não vê alteração e o teste passaria
  -- sem provar nada.
  begin
    update public.guides set status = 'suspenso'
     where id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: guia conseguiu mudar o próprio status';
  exception when insufficient_privilege then
    raise notice 'ok  guia não consegue mudar o próprio status';
  end;

  begin
    update public.guides set comissao_percentual = 1
     where id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: guia conseguiu zerar a própria comissão';
  exception when insufficient_privilege then
    raise notice 'ok  guia não consegue mexer na própria comissão';
  end;

  -- O que ele PODE mudar tem de continuar funcionando.
  update public.guides set cidade = 'Boa Esperança'
   where id = '10000000-0000-0000-0000-00000000000a';
  raise notice 'ok  guia continua editando os próprios dados de apresentação';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 11. Guia novo nasce pendente, mesmo pedindo aprovado ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare v_status text; v_comissao numeric;
begin
  insert into public.guides (user_id, nome_operacao, status, comissao_percentual)
  values ('00000000-0000-0000-0000-0000000000c1', 'Tentativa', 'aprovado', 0)
  returning status, comissao_percentual into v_status, v_comissao;

  if v_status <> 'pendente' then
    raise exception 'FALHA: guia nasceu com status %', v_status;
  end if;
  if v_comissao is not null then
    raise exception 'FALHA: guia nasceu com comissão % em vez de nula', v_comissao;
  end if;
  raise notice 'ok  inscrição nasce pendente e sem comissão própria';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 12. O master decide ---'; end $$;
-- =============================================================================
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000aa');

do $$
declare v_status text;
begin
  update public.guides
     set status = 'aprovado', comissao_percentual = 12
   where id = '10000000-0000-0000-0000-00000000000a'
  returning status into v_status;

  if v_status <> 'aprovado' then
    raise exception 'FALHA: master não conseguiu aprovar (status %)', v_status;
  end if;
  raise notice 'ok  master aprova e define a comissão';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 13. As três views definer não vazam (Security Advisor) ---'; end $$;
-- =============================================================================
-- O Security Advisor do Supabase marca toda view SECURITY DEFINER como erro,
-- porque ela lê as tabelas como dona e ignora o RLS delas. Aqui isso é
-- deliberado: é o que permite revogar o acesso direto a `catches` e ainda
-- servir feed, ranking e "minhas capturas". Como o alerta fica ligado para
-- sempre, o que protege de verdade são estas assertivas.
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');

do $$
declare n integer; tem_coordenada boolean;
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  -- "Minhas capturas" com a permissão de dona poderia devolver as de todo
  -- mundo. O filtro por auth.uid() dentro da view é a única coisa que impede.
  select count(*) into n from public.v_minhas_capturas;
  if n <> 0 then
    raise exception 'FALHA: v_minhas_capturas devolveu % captura(s) de outra pessoa', n;
  end if;
  raise notice 'ok  v_minhas_capturas não mostra captura de outro pescador';

  -- O ranking é público de propósito, então a proteção tem de estar na forma:
  -- coordenada nenhuma pode existir entre as colunas.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_ranking_mensal'
      and column_name in ('lat', 'lng', 'isca', 'profundidade_m', 'hora_fisgada')
  ) into tem_coordenada;
  if tem_coordenada then
    raise exception 'FALHA: v_ranking_mensal expõe coluna sensível';
  end if;

  select count(*) into n from public.v_ranking_mensal;
  if n < 1 then raise exception 'FALHA: ranking vazio, o teste não provaria nada'; end if;
  raise notice 'ok  v_ranking_mensal mostra o ranking sem nenhuma coordenada';
end $$;
rollback;

begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare n integer;
begin
  select count(*) into n from public.v_minhas_capturas;
  if n <> 1 then
    raise exception 'FALHA: dono viu % das próprias capturas, esperado 1', n;
  end if;
  raise notice 'ok  o dono continua vendo as próprias capturas';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 14. Funções privilegiadas não são chamáveis de fora ---'; end $$;
-- =============================================================================
-- O Supabase publica o schema public como API REST, então toda função com
-- EXECUTE aberto vira /rest/v1/rpc/<nome>. is_diamond aceita o id de outra
-- pessoa: aberta, respondia "fulano é assinante?" a quem perguntasse.
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare n integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  -- c2 É Diamond. Perguntar por ele tem de devolver falso mesmo assim.
  if public.is_diamond('00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FALHA: cliente descobriu que outra pessoa é Diamond';
  end if;
  raise notice 'ok  is_diamond não responde sobre a assinatura de terceiros';

  -- O feed continua funcionando: a view é dona e chama is_diamond por dentro.
  select count(*) into n from public.v_catches_feed;
  if n < 1 then
    raise exception 'FALHA: o feed parou de funcionar ao fechar is_diamond';
  end if;
  raise notice 'ok  o feed continua funcionando mesmo assim';

  -- E as políticas, que dependem de is_master/is_guide_owner, também.
  select count(*) into n from public.guides;
  raise notice 'ok  políticas seguem avaliando (guides respondeu com % linha(s))', n;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 15. Sem Mercado Pago conectado, não se abre data ---'; end $$;
-- =============================================================================
-- Se essa porta não existir, um cliente reserva e paga sem que exista caminho
-- para o dinheiro chegar ao guia — e o problema aparece só no pagamento, com o
-- cliente no meio.
begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000b2');

do $$
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  begin
    insert into public.boat_availability
      (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
    values ('20000000-0000-0000-0000-00000000000b', current_date + 60, 50000, 0);
    raise exception 'FALHA: guia sem Mercado Pago conseguiu abrir data';
  exception when insufficient_privilege then
    raise notice 'ok  guia sem Mercado Pago conectado não abre data';
  end;
end $$;
rollback;

begin;
select auth.entrar_como('00000000-0000-0000-0000-0000000000b1');
do $$
begin
  insert into public.boat_availability
    (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
  values ('20000000-0000-0000-0000-00000000000a', current_date + 60, 50000, 0);
  raise notice 'ok  guia pronto abre data normalmente';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 16. Agenda de operação não aprovada não é pública ---'; end $$;
-- =============================================================================
begin;
set role postgres;
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000b9', 'pendente@teste');
insert into public.profiles (id, nome, role)
  values ('00000000-0000-0000-0000-0000000000b9', 'Guia Pendente', 'guia');
insert into public.guides (id, user_id, nome_operacao, status)
  values ('10000000-0000-0000-0000-00000000000c',
          '00000000-0000-0000-0000-0000000000b9', 'Ainda Pendente', 'pendente');
insert into public.boats (id, guide_id, nome, capacidade_max)
  values ('20000000-0000-0000-0000-00000000000c',
          '10000000-0000-0000-0000-00000000000c', 'Barco C', 5);
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
  values ('20000000-0000-0000-0000-00000000000c', current_date + 40, 99000, 0);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare n integer;
begin
  select count(*) into n from public.boat_availability
   where boat_id = '20000000-0000-0000-0000-00000000000c';
  if n <> 0 then
    raise exception 'FALHA: cliente viu a agenda e o preço de operação pendente';
  end if;
  raise notice 'ok  cliente não vê agenda nem preço de operação pendente';

  select count(*) into n from public.boat_availability
   where boat_id = '20000000-0000-0000-0000-00000000000a';
  if n < 1 then
    raise exception 'FALHA: cliente deixou de ver a agenda de operação aprovada';
  end if;
  raise notice 'ok  agenda de operação aprovada continua visível';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 17. criar_reserva: quem cobra é quem calcula ---'; end $$;
-- =============================================================================
-- O cliente diz O QUE quer; o servidor decide QUANTO custa. Se este bloco
-- falhar, existe um caminho para reservar um passeio de mil reais por um
-- centavo — e nenhuma política de RLS enxergaria isso, porque para ela o preço
-- é só mais uma coluna.
begin;
set role postgres;

-- Os dois documentos que a reserva precisa aceitar. Não vêm do seed.sql: são
-- publicados por tools/seed-legal.mjs a partir de docs/legal/.
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política',  'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',     'texto do termo');

-- Uma data livre para reservar: a de +30 já está vendida na massa de teste.
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare r public.bookings; n integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  r := public.criar_reserva(
         '20000000-0000-0000-0000-00000000000a', current_date + 45, 4,
         '[{"nome":"João","telefone":"35999990000"},{"nome":"Maria"}]'::jsonb,
         true, true);

  -- 60.000 do dia + 15.000 × 4 pescadores = 120.000
  if r.valor_total_centavos <> 120000 then
    raise exception 'FALHA: total calculado deu % em vez de 120000', r.valor_total_centavos;
  end if;
  -- Guia A tem 10%; o barco não tem valor próprio.
  if r.comissao_percentual <> 10 or r.comissao_centavos <> 12000 then
    raise exception 'FALHA: comissão saiu % %% = % centavos',
      r.comissao_percentual, r.comissao_centavos;
  end if;
  if r.repasse_guia_centavos <> 108000 then
    raise exception 'FALHA: repasse ao guia deu %', r.repasse_guia_centavos;
  end if;
  -- Sinal padrão da plataforma: 30%.
  if r.sinal_centavos <> 36000 or r.saldo_centavos <> 84000 then
    raise exception 'FALHA: sinal % e saldo %', r.sinal_centavos, r.saldo_centavos;
  end if;
  if r.status <> 'pendente' or r.status_pagamento <> 'aguardando_sinal' then
    raise exception 'FALHA: reserva nasceu % / %', r.status, r.status_pagamento;
  end if;
  if r.expira_em is null or r.expira_em > now() + interval '21 minutes' then
    raise exception 'FALHA: expiração ficou em %', r.expira_em;
  end if;
  -- Prazo de quitação: 7 dias antes da pescaria.
  if r.quitacao_vence_em <> current_date + 38 then
    raise exception 'FALHA: quitação vence em %', r.quitacao_vence_em;
  end if;
  raise notice 'ok  preço, comissão, sinal, saldo e prazos calculados no servidor';

  select count(*) into n from public.booking_participants where booking_id = r.id;
  if n <> 2 then raise exception 'FALHA: gravou % participante(s), esperado 2', n; end if;
  raise notice 'ok  participantes gravados junto com a reserva';

  -- O aceite da pescaria, com hash do texto — é o que sustenta a retenção
  -- quando alguém cancela e discorda dela meses depois.
  select count(*) into n from public.terms_acceptances
   where booking_id = r.id and length(hash_sha256) = 64;
  if n <> 2 then
    raise exception 'FALHA: gravou % aceite(s) com hash, esperado 2', n;
  end if;
  if r.politica_versao <> 'teste-1' or r.termo_versao <> 'teste-1' then
    raise exception 'FALHA: versões não congeladas na reserva (% / %)',
      r.politica_versao, r.termo_versao;
  end if;
  raise notice 'ok  aceites da reserva gravados com hash e versão congelada';
end $$;

-- A segunda tentativa no mesmo barco e no mesmo dia tem de bater na trava.
do $$
begin
  begin
    perform public.criar_reserva(
      '20000000-0000-0000-0000-00000000000a', current_date + 45, 2,
      '[]'::jsonb, true, true);
    raise exception 'FALHA: o mesmo barco foi reservado duas vezes no mesmo dia';
  exception when unique_violation then
    raise notice 'ok  segunda reserva do mesmo barco/dia recusada com erro claro';
  end;
end $$;
rollback;

-- --- as recusas, uma a uma ---------------------------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 46, 60000, 15000);
update public.boat_availability set status = 'bloqueado'
 where boat_id = '20000000-0000-0000-0000-00000000000a' and data = current_date + 46;
-- Guia B está aprovado, mas nunca conectou o Mercado Pago.
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000b', current_date + 45, 80000, 10000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');

do $$
declare v_msg text;
begin
  -- 1. sem aceitar os documentos
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date + 45, 2, '[]'::jsonb, false, true);
    raise exception 'FALHA: reservou sem aceitar a política de cancelamento';
  exception when check_violation then null;
  end;
  raise notice 'ok  reserva sem aceite dos documentos é recusada';

  -- 2. mais pescadores do que o barco leva (barco A vai até 4)
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date + 45, 9, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou 9 pessoas num barco de 4';
  exception when check_violation then null;
  end;
  raise notice 'ok  capacidade do barco é respeitada';

  -- 3. data no passado
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date - 1, 2, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou uma pescaria que já passou';
  exception when check_violation then null;
  end;
  raise notice 'ok  data no passado é recusada';

  -- 4. data bloqueada pelo guia
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date + 46, 2, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou uma data bloqueada';
  exception when check_violation then null;
  end;
  raise notice 'ok  data bloqueada não é reservável';

  -- 5. data que o guia nunca abriu
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date + 200, 2, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou um dia que não está na agenda';
  exception when check_violation then null;
  end;
  raise notice 'ok  dia fora da agenda não é reservável';

  -- 6. guia sem Mercado Pago conectado
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000b',
                                 current_date + 45, 2, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou com guia sem caminho para receber';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%pagamento%' then raise exception 'FALHA: recusa por outro motivo: %', v_msg; end if;
  end;
  raise notice 'ok  guia sem Mercado Pago conectado não recebe reserva';

  -- 7. mais participantes do que lugares pagos
  begin
    perform public.criar_reserva(
      '20000000-0000-0000-0000-00000000000a', current_date + 45, 2,
      '[{"nome":"A"},{"nome":"B"},{"nome":"C"}]'::jsonb, true, true);
    raise exception 'FALHA: listou 3 pessoas numa reserva de 2 lugares';
  exception when check_violation then null;
  end;
  raise notice 'ok  lista de participantes não passa do número de lugares';
end $$;
rollback;

-- --- documento não publicado ------------------------------------------------
-- Banco recém-criado, antes de publicar docs/legal/. Ninguém pode ser vinculado
-- a um texto que não existe — e a recusa tem de dizer isso, não estourar.
begin;
set role postgres;
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare v_msg text;
begin
  begin
    perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                                 current_date + 45, 2, '[]'::jsonb, true, true);
    raise exception 'FALHA: reservou sem documento legal publicado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%não publicados%' then
      raise exception 'FALHA: recusou por outro motivo: %', v_msg;
    end if;
  end;
  raise notice 'ok  sem documento publicado, a recusa explica em vez de estourar';
end $$;
rollback;

-- --- a cascata da comissão ---------------------------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);
-- O barco passa a ter comissão própria: 15% tem de vencer os 10% do guia.
update public.boats set comissao_percentual = 15
 where id = '20000000-0000-0000-0000-00000000000a';

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);
  if r.comissao_percentual <> 15 or r.comissao_centavos <> 18000 then
    raise exception 'FALHA: comissão do barco não venceu a do guia (% %%, %)',
      r.comissao_percentual, r.comissao_centavos;
  end if;
  raise notice 'ok  comissão do barco vence a do guia';
end $$;
rollback;

-- Guia sem comissão própria cai no padrão da plataforma (10% no seed).
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);
update public.guides set comissao_percentual = null
 where id = '10000000-0000-0000-0000-00000000000a';
update public.app_settings set valor = '8'::jsonb where chave = 'comissao_padrao_percentual';

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);
  if r.comissao_percentual <> 8 then
    raise exception 'FALHA: sem comissão no guia, deveria cair nos 8%% do padrão, veio %',
      r.comissao_percentual;
  end if;
  raise notice 'ok  sem valor no barco nem no guia, vale o padrão da plataforma';
end $$;
rollback;

-- Guia isento: comissão ZERO é um valor, não "sem valor".
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);
update public.guides set comissao_percentual = 0
 where id = '10000000-0000-0000-0000-00000000000a';

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);
  if r.comissao_percentual <> 0 or r.comissao_centavos <> 0 then
    raise exception 'FALHA: guia isento acabou pagando comissão (% %%)', r.comissao_percentual;
  end if;
  if r.repasse_guia_centavos <> r.valor_total_centavos then
    raise exception 'FALHA: guia isento não recebeu o valor cheio';
  end if;
  raise notice 'ok  comissão zero é respeitada, não confundida com ausência de valor';
end $$;
rollback;

-- --- desconto Diamond --------------------------------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 47, 60000, 15000);
update public.guides
   set oferece_desconto_diamond = true, desconto_diamond_percentual = 10
 where id = '10000000-0000-0000-0000-00000000000a';

-- Cliente comum: nada muda.
select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);
  if r.desconto_centavos <> 0 then
    raise exception 'FALHA: cliente comum ganhou desconto de Diamond (%)', r.desconto_centavos;
  end if;
  raise notice 'ok  cliente comum não recebe o desconto Diamond';
end $$;

-- Assinante ativo: 10% saem do valor, e a comissão incide sobre o líquido.
select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 47, 4, '[]'::jsonb, true, true);
  if r.desconto_centavos <> 12000 then
    raise exception 'FALHA: desconto Diamond deu % em vez de 12000', r.desconto_centavos;
  end if;
  -- 120.000 − 12.000 = 108.000 líquidos; 10% = 10.800 de comissão.
  if r.comissao_centavos <> 10800 or r.repasse_guia_centavos <> 97200 then
    raise exception 'FALHA: comissão % e repasse % sobre o líquido',
      r.comissao_centavos, r.repasse_guia_centavos;
  end if;
  raise notice 'ok  Diamond ganha desconto e a comissão incide sobre o líquido';
end $$;
rollback;

-- --- arredondamento ----------------------------------------------------------
-- Valor que não divide redondo: a soma das partes tem de continuar fechando ao
-- centavo, senão o banco recusa a própria reserva pelas restrições de 0001.
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 99999, 3333);
update public.guides set comissao_percentual = 7.33
 where id = '10000000-0000-0000-0000-00000000000a';

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 3, '[]'::jsonb, true, true);
  if r.comissao_centavos + r.repasse_guia_centavos
     <> r.valor_total_centavos - r.desconto_centavos then
    raise exception 'FALHA: comissão + repasse não fecha o total';
  end if;
  if r.sinal_centavos + r.saldo_centavos
     <> r.valor_total_centavos - r.desconto_centavos then
    raise exception 'FALHA: sinal + saldo não fecha o total';
  end if;
  raise notice 'ok  com valor quebrado, as partes ainda fecham ao centavo';
end $$;
rollback;

-- --- a reserva criada é de quem chamou, e só ele a vê -------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

-- O outro cliente reserva primeiro.
select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 2,
                            '[{"nome":"Convidado do c2"}]'::jsonb, true, true);
  if r.user_id <> '00000000-0000-0000-0000-0000000000c2' then
    raise exception 'FALHA: reserva saiu no nome de %, não de quem chamou', r.user_id;
  end if;
  raise notice 'ok  a reserva sai no nome de quem chamou a função';
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare n integer;
begin
  select count(*) into n from public.bookings
   where boat_id = '20000000-0000-0000-0000-00000000000a'
     and data = current_date + 45;
  if n <> 0 then
    raise exception 'FALHA: cliente enxergou a reserva de outra pessoa';
  end if;

  select count(*) into n from public.booking_participants
   where nome = 'Convidado do c2';
  if n <> 0 then
    raise exception 'FALHA: cliente enxergou os acompanhantes de outra pessoa';
  end if;

  select count(*) into n from public.terms_acceptances
   where user_id = '00000000-0000-0000-0000-0000000000c2';
  if n <> 0 then
    raise exception 'FALHA: cliente enxergou os aceites de outra pessoa';
  end if;
  raise notice 'ok  reserva, acompanhantes e aceites alheios continuam invisíveis';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 18. O que o cliente vê da agenda e das reservas ---'; end $$;
-- =============================================================================
-- "Esta data está ocupada" é informação sobre a reserva de outra pessoa. O
-- cliente precisa dela para não escolher um dia vendido — e não pode receber
-- nada além dela.
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 46, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 47, 60000, 15000);
-- +47 fica bloqueada pelo guia.
update public.boat_availability set status = 'bloqueado'
 where boat_id = '20000000-0000-0000-0000-00000000000a' and data = current_date + 47;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
declare n integer;
begin
  perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                               current_date + 46, 2, '[]'::jsonb, true, true);
  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000a')
   where data = current_date + 46;
  if n <> 0 then raise exception 'FALHA: data que acabei de reservar continua sendo oferecida'; end if;
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare n integer;
begin
  -- A data +30 já está confirmada na massa de teste; +46 acabou de ser
  -- reservada por outra pessoa; +47 está bloqueada. Sobra a +45 e a +60 que
  -- nenhum bloco anterior criou.
  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000a')
   where data in (current_date + 30, current_date + 46, current_date + 47);
  if n <> 0 then
    raise exception 'FALHA: agenda ofereceu % data(s) já vendida(s) ou fechada(s)', n;
  end if;

  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000a')
   where data = current_date + 45;
  if n <> 1 then raise exception 'FALHA: a data livre sumiu da agenda'; end if;
  raise notice 'ok  agenda esconde data vendida, expirada e bloqueada, e mostra a livre';

  -- Barco de guia sem Mercado Pago não aparece para ninguém reservar.
  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000b');
  if n <> 0 then
    raise exception 'FALHA: agenda de guia sem caminho de recebimento foi oferecida';
  end if;
  raise notice 'ok  agenda de guia sem Mercado Pago não é oferecida';

  -- E "minhas reservas" continua sendo só minha.
  select count(*) into n from public.minhas_reservas() where data = current_date + 46;
  if n <> 0 then
    raise exception 'FALHA: minhas_reservas devolveu a reserva de outra pessoa';
  end if;
  select count(*) into n from public.minhas_reservas();
  if n <> 1 then
    raise exception 'FALHA: esperava a própria reserva confirmada, vieram %', n;
  end if;
  raise notice 'ok  minhas_reservas devolve só as próprias, com nome do guia e do barco';
end $$;
rollback;

-- --- reserva abandonada devolve a data -------------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 2, '[]'::jsonb, true, true);
  -- Ninguém pagou e os 20 minutos passaram.
  set local role postgres;
  update public.bookings set expira_em = now() - interval '1 minute' where id = r.id;
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare n integer; r public.bookings;
begin
  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000a')
   where data = current_date + 45;
  if n <> 1 then
    raise exception 'FALHA: reserva abandonada continuou segurando a data';
  end if;
  raise notice 'ok  reserva não paga e vencida devolve a data à agenda';

  -- E outra pessoa consegue fechá-la de verdade, sem esbarrar na trava única.
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 2, '[]'::jsonb, true, true);
  if r.user_id <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FALHA: a data não passou para quem reservou depois';
  end if;
  raise notice 'ok  a data vencida é efetivamente reservável por outra pessoa';
end $$;
rollback;

-- --- desistir antes de pagar -------------------------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings; n integer;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 2, '[]'::jsonb, true, true);
  r := public.cancelar_reserva(r.id);
  if r.status <> 'cancelada' or r.cancelada_em is null then
    raise exception 'FALHA: cancelamento não pegou (status %)', r.status;
  end if;

  select count(*) into n from public.datas_disponiveis('20000000-0000-0000-0000-00000000000a')
   where data = current_date + 45;
  if n <> 1 then raise exception 'FALHA: cancelar não devolveu a data à agenda'; end if;
  raise notice 'ok  desistência antes de pagar devolve a data na hora';

  -- Repetir o cancelamento não pode virar erro: o dedo escorrega, a rede cai.
  perform public.cancelar_reserva(r.id);
  raise notice 'ok  cancelar de novo é inofensivo';
end $$;

-- A reserva confirmada e paga da massa de teste tem de resistir.
do $$
begin
  begin
    perform public.cancelar_reserva('30000000-0000-0000-0000-00000000000a');
    raise exception 'FALHA: cancelou reserva com sinal pago sem devolver nada';
  exception when check_violation then
    raise notice 'ok  reserva com dinheiro dentro não é cancelada por esta função';
  end;
end $$;

-- E ninguém cancela a reserva alheia.
select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
begin
  begin
    perform public.cancelar_reserva('30000000-0000-0000-0000-00000000000a');
    raise exception 'FALHA: cancelou a reserva de outra pessoa';
  exception when insufficient_privilege then
    raise notice 'ok  reserva alheia não é cancelável';
  end;
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 19. Avisos: os dois lados, com valores congelados ---'; end $$;
-- =============================================================================
-- Quem avisa não pode ser quem está com o aplicativo aberto: a reserva nasce de
-- madrugada, o pagamento vem de webhook, a data expira sozinha. Se o aviso
-- dependesse de uma tela ligada, o guia descobriria a reserva no dia.
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare r public.bookings; n integer; a public.notifications;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);

  -- Daqui para baixo, lendo fora do RLS: como cliente eu enxergaria só o meu
  -- aviso, e a contagem daria 1 mesmo com tudo funcionando. Que o cliente NÃO
  -- veja o aviso do guia é assunto do bloco seguinte.
  set local role postgres;

  select count(*) into n from public.notifications where booking_id = r.id;
  if n <> 2 then
    raise exception 'FALHA: a reserva gerou % aviso(s), esperado 2 (cliente e guia)', n;
  end if;

  -- O cliente é avisado do que ele precisa fazer.
  select * into a from public.notifications
   where booking_id = r.id and user_id = '00000000-0000-0000-0000-0000000000c1';
  if a.tipo <> 'reserva_criada' then raise exception 'FALHA: tipo do aviso %', a.tipo; end if;
  if a.valor_pago_centavos <> 0 or a.valor_aberto_centavos <> 120000 then
    raise exception 'FALHA: aviso diz pago % e aberto %',
      a.valor_pago_centavos, a.valor_aberto_centavos;
  end if;
  if a.corpo not like '%R$ 1.200,00%' then
    raise exception 'FALHA: valor mal formatado no aviso: %', a.corpo;
  end if;
  if a.lida_em is not null then raise exception 'FALHA: aviso já nasceu lido'; end if;

  -- E o guia, do que entra para ele.
  select * into a from public.notifications
   where booking_id = r.id and user_id = '00000000-0000-0000-0000-0000000000b1';
  if a.corpo not like '%R$ 1.080,00%' then
    raise exception 'FALHA: guia não foi avisado do próprio repasse: %', a.corpo;
  end if;
  raise notice 'ok  reserva avisa cliente e guia, cada um com o valor que lhe importa';

  -- Pagamento: o webhook mexe no status e o aviso sai sozinho.
  update public.bookings set status_pagamento = 'sinal_pago', status = 'confirmada'
   where id = r.id;

  select count(*) into n from public.notifications
   where booking_id = r.id and tipo = 'reserva_confirmada';
  if n <> 2 then raise exception 'FALHA: confirmação gerou % aviso(s)', n; end if;

  select * into a from public.notifications
   where booking_id = r.id and tipo = 'reserva_confirmada'
     and user_id = '00000000-0000-0000-0000-0000000000c1';
  if a.valor_pago_centavos <> 36000 or a.valor_aberto_centavos <> 84000 then
    raise exception 'FALHA: confirmada com pago % e aberto %',
      a.valor_pago_centavos, a.valor_aberto_centavos;
  end if;
  raise notice 'ok  confirmação avisa os dois com o pago e o que falta';

  update public.bookings set status_pagamento = 'quitada' where id = r.id;
  select count(*) into n from public.notifications
   where booking_id = r.id and tipo = 'saldo_quitado';
  if n <> 2 then raise exception 'FALHA: quitação gerou % aviso(s)', n; end if;

  -- Congelado: o aviso da reserva continua dizendo o que dizia, mesmo depois de
  -- tudo pago. Um aviso é registro do passado, não espelho do presente.
  select * into a from public.notifications
   where booking_id = r.id and tipo = 'reserva_criada'
     and user_id = '00000000-0000-0000-0000-0000000000c1';
  if a.valor_pago_centavos <> 0 then
    raise exception 'FALHA: aviso antigo foi reescrito (pago virou %)', a.valor_pago_centavos;
  end if;
  raise notice 'ok  quitação avisa, e o aviso antigo não é reescrito';

  -- Mudança que não interessa a ninguém não vira aviso.
  select count(*) into n from public.notifications where booking_id = r.id;
  update public.bookings set no_show = true where id = r.id;
  if (select count(*) from public.notifications where booking_id = r.id) <> n then
    raise exception 'FALHA: mudança irrelevante gerou aviso';
  end if;
  raise notice 'ok  mudança sem interesse não vira aviso';
end $$;
rollback;

-- --- ninguém lê nem reescreve o aviso alheio ---------------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$ declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 45, 4, '[]'::jsonb, true, true);
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c2');
do $$
declare n integer;
begin
  select count(*) into n from public.notifications;
  if n <> 0 then raise exception 'FALHA: terceiro leu % aviso(s) alheio(s)', n; end if;
  raise notice 'ok  aviso de outra pessoa é invisível';
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$
declare a public.notifications;
begin
  update public.notifications set lida_em = now() where lida_em is null;
  select * into a from public.notifications limit 1;
  if a.lida_em is null then raise exception 'FALHA: dono não conseguiu marcar como lido'; end if;
  raise notice 'ok  o dono marca o próprio aviso como lido';

  -- RLS decide por linha, nunca por coluna: sem o gatilho, marcar como lido
  -- daria também o poder de reescrever o valor avisado.
  update public.notifications set valor_aberto_centavos = 1, corpo = 'inventado';
  select * into a from public.notifications limit 1;
  if a.valor_aberto_centavos = 1 or a.corpo = 'inventado' then
    raise exception 'FALHA: o dono reescreveu o próprio aviso';
  end if;
  raise notice 'ok  marcar como lido não dá licença para reescrever o aviso';
end $$;
rollback;

-- =============================================================================
do $$ begin raise notice '--- 20. Agenda: do guia, do master, por período ---'; end $$;
-- =============================================================================
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 3,  60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 10, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 40, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$ declare r public.bookings;
begin
  r := public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                            current_date + 3, 4, '[]'::jsonb, true, true);
  set local role postgres;
  update public.bookings set status_pagamento = 'sinal_pago', status = 'confirmada'
   where id = r.id;
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000b1');
do $$
declare n integer; l record;
begin
  if current_user <> 'authenticated' then
    raise exception 'FALHA: teste rodando como %, não como authenticated', current_user;
  end if;

  -- Semana
  select count(*) into n from public.agenda(current_date, current_date + 7);
  if n <> 1 then raise exception 'FALHA: a semana devolveu % dia(s), esperado 1', n; end if;

  -- Mês. Contar às cegas esconde erro: a massa de teste já tem a data +30
  -- vendida, e ela precisa aparecer junto. Então confere-se o conjunto.
  select count(*) into n from public.agenda(current_date, current_date + 30)
   where data in (current_date + 3, current_date + 10, current_date + 30);
  if n <> 3 then raise exception 'FALHA: faltou dia no mês (achei % dos 3)', n; end if;

  select count(*) into n from public.agenda(current_date, current_date + 30)
   where data = current_date + 40;
  if n <> 0 then raise exception 'FALHA: o mês trouxe uma data de fora do período'; end if;

  -- Dia específico
  select count(*) into n from public.agenda(current_date + 10, current_date + 10);
  if n <> 1 then raise exception 'FALHA: o dia devolveu % linha(s)', n; end if;
  raise notice 'ok  a mesma função responde semana, mês e dia específico';

  -- O dia reservado traz cliente e dinheiro; o dia livre não inventa zero.
  select * into l from public.agenda(current_date + 3, current_date + 3);
  if l.cliente_nome is null or l.booking_id is null then
    raise exception 'FALHA: dia reservado veio sem cliente';
  end if;
  if l.valor_pago_centavos <> 36000 or l.valor_aberto_centavos <> 84000 then
    raise exception 'FALHA: dia reservado com pago % e aberto %',
      l.valor_pago_centavos, l.valor_aberto_centavos;
  end if;
  raise notice 'ok  dia reservado mostra o cliente, o quitado e o que está em aberto';

  select * into l from public.agenda(current_date + 10, current_date + 10);
  if l.valor_pago_centavos is not null then
    raise exception 'FALHA: dia livre veio com "pago %" em vez de vazio', l.valor_pago_centavos;
  end if;
  raise notice 'ok  dia livre não finge que existe pescaria sem pagamento';
end $$;

-- E o outro guia não vê nada disso.
select auth.entrar_como('00000000-0000-0000-0000-0000000000b2');
do $$
declare n integer;
begin
  -- Zero linhas provaria pouco: o guia B tem barco próprio e data própria no
  -- período. O que não pode aparecer é o barco do guia A.
  select count(*) into n from public.agenda(current_date, current_date + 60)
   where boat_id = '20000000-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'FALHA: guia B viu % dia(s) do barco do guia A', n; end if;

  select count(*) into n from public.agenda(current_date, current_date + 60)
   where boat_id = '20000000-0000-0000-0000-00000000000b';
  if n < 1 then raise exception 'FALHA: guia B deixou de ver o próprio barco'; end if;
  raise notice 'ok  cada guia vê a própria agenda, e só a própria';

  -- E pedir explicitamente a agenda do outro não abre nada: o filtro de dono
  -- vem antes do filtro de guia, e é essa ordem que sustenta a função.
  select count(*) into n from public.agenda(current_date, current_date + 60,
                                            '10000000-0000-0000-0000-00000000000a');
  if n <> 0 then
    raise exception 'FALHA: guia B pediu a agenda do guia A e recebeu % linha(s)', n;
  end if;
  raise notice 'ok  pedir a agenda alheia pelo nome não contorna nada';

  -- E a lista de guias do filtro é só do master.
  select count(*) into n from public.guias_com_agenda();
  if n <> 0 then raise exception 'FALHA: guia enxergou a lista de operações do master'; end if;
  raise notice 'ok  a lista de operações do filtro é exclusiva do master';
end $$;

-- O master vê a plataforma inteira, e consegue estreitar num guia só.
select auth.entrar_como('00000000-0000-0000-0000-0000000000aa');
do $$
declare n integer; l record;
begin
  select count(distinct guide_id) into n from public.agenda(current_date, current_date + 60);
  if n < 2 then
    raise exception 'FALHA: master viu % operação(ões), esperava as duas', n;
  end if;
  raise notice 'ok  o master enxerga a agenda de todos os guias';

  select count(distinct guide_id) into n
    from public.agenda(current_date, current_date + 60, '10000000-0000-0000-0000-00000000000a');
  if n <> 1 then
    raise exception 'FALHA: filtrar por um guia devolveu % operação(ões)', n;
  end if;
  raise notice 'ok  o master consegue estreitar num guia só';

  select * into l from public.agenda(current_date + 3, current_date + 3);
  if l.guia_nome is null then raise exception 'FALHA: linha sem o nome da operação'; end if;
  if l.comissao_centavos is null then
    raise exception 'FALHA: master não recebeu a comissão da reserva';
  end if;
  raise notice 'ok  cada linha traz a operação e a comissão da plataforma';

  select count(*) into n from public.guias_com_agenda();
  if n < 2 then raise exception 'FALHA: filtro do master listou % operação(ões)', n; end if;
  raise notice 'ok  o master recebe a lista de operações para filtrar';
end $$;
rollback;

-- --- fechar dia com reserva não pode ser silencioso --------------------------
begin;
set role postgres;
insert into public.legal_documents (slug, versao, titulo, corpo_markdown) values
  ('politica_cancelamento',  'teste-1', 'Política', 'texto da política'),
  ('termo_responsabilidade', 'teste-1', 'Termo',    'texto do termo');
insert into public.boat_availability (boat_id, data, preco_barco_centavos, preco_passageiro_centavos)
values ('20000000-0000-0000-0000-00000000000a', current_date + 45, 60000, 15000),
       ('20000000-0000-0000-0000-00000000000a', current_date + 46, 60000, 15000);

select auth.entrar_como('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.criar_reserva('20000000-0000-0000-0000-00000000000a',
                               current_date + 45, 4, '[]'::jsonb, true, true);
end $$;

select auth.entrar_como('00000000-0000-0000-0000-0000000000b1');
do $$
begin
  begin
    delete from public.boat_availability
     where boat_id = '20000000-0000-0000-0000-00000000000a' and data = current_date + 45;
    raise exception 'FALHA: o guia apagou um dia que já tinha reserva';
  exception when check_violation then
    raise notice 'ok  dia com reserva não é apagado sem cancelar antes';
  end;

  begin
    update public.boat_availability set status = 'bloqueado'
     where boat_id = '20000000-0000-0000-0000-00000000000a' and data = current_date + 45;
    raise exception 'FALHA: o guia bloqueou um dia que já tinha reserva';
  exception when check_violation then
    raise notice 'ok  dia com reserva não é bloqueado sem cancelar antes';
  end;

  -- E o dia sem reserva continua fechando normalmente.
  delete from public.boat_availability
   where boat_id = '20000000-0000-0000-0000-00000000000a' and data = current_date + 46;
  raise notice 'ok  dia livre continua sendo fechado sem cerimônia';
end $$;
rollback;

do $$ begin raise notice ''; raise notice 'TODOS OS TESTES DE RLS PASSARAM'; end $$;
