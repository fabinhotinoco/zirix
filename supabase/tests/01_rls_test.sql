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

insert into public.guides (id, user_id, nome_operacao, status, comissao_percentual, mp_access_token)
values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
   'Pesca Vertical', 'aprovado', 10, 'TOKEN-SECRETO-A'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2',
   'Pescaria do Zé', 'aprovado', 12, 'TOKEN-SECRETO-B');

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
  begin
    update public.guides set status = 'aprovado'
     where id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: guia conseguiu se aprovar';
  exception when insufficient_privilege then
    raise notice 'ok  guia não consegue mudar o próprio status';
  end;

  begin
    update public.guides set comissao_percentual = 0
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

do $$ begin raise notice ''; raise notice 'TODOS OS TESTES DE RLS PASSARAM'; end $$;
