/**
 * Testes do núcleo financeiro.
 *
 *   node --test --experimental-strip-types packages/core/test/
 *
 * Sem dependências: node:test e node:assert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolverComissao,
  calcularReserva,
  ratearComissao,
  vencimentoQuitacao,
} from '../src/pricing.ts';

import {
  calcularCancelamento,
  calcularDevolucaoPorRevenda,
  comissaoRevertida,
  faixaAplicavel,
  type FaixaRetencao,
} from '../src/cancellation.ts';

// Escala padrão da plataforma (espelha supabase/seed.sql).
const FAIXAS: FaixaRetencao[] = [
  { diasMin: 30, diasMax: null, retencaoPercentual: 5 },
  { diasMin: 15, diasMax: 29, retencaoPercentual: 25 },
  { diasMin: 7, diasMax: 14, retencaoPercentual: 50 },
  { diasMin: 3, diasMax: 6, retencaoPercentual: 75 },
  { diasMin: 0, diasMax: 2, retencaoPercentual: 100 },
];

// =============================================================================
test('cascata da comissão: o nível mais específico vence', () => {
  const padrao = { padrao: 10, guia: 12, barco: 15, reservaOverride: 8 };

  assert.deepEqual(resolverComissao(padrao), { percentual: 8, origem: 'reserva' });
  assert.deepEqual(resolverComissao({ ...padrao, reservaOverride: null }), {
    percentual: 15,
    origem: 'barco',
  });
  assert.deepEqual(
    resolverComissao({ ...padrao, reservaOverride: null, barco: null }),
    { percentual: 12, origem: 'guia' },
  );
  assert.deepEqual(
    resolverComissao({ padrao: 10, guia: null, barco: null, reservaOverride: null }),
    { percentual: 10, origem: 'padrao' },
  );
});

test('comissão zero é respeitada, não confundida com ausência', () => {
  // Guia com isenção negociada: 0 é um valor, não "não configurado".
  assert.deepEqual(resolverComissao({ padrao: 10, guia: 0 }), {
    percentual: 0,
    origem: 'guia',
  });
});

// =============================================================================
test('reserva do planejamento: R$ 1.000, comissão 10%, sinal 30%', () => {
  const r = calcularReserva({
    precoBarcoCentavos: 40000,
    precoPassageiroCentavos: 15000,
    qtdPescadores: 4,
    comissaoPercentual: 10,
    sinalPercentual: 30,
  });

  assert.equal(r.valorTotalCentavos, 100000);
  assert.equal(r.valorLiquidoCentavos, 100000);
  assert.equal(r.comissaoCentavos, 10000);
  assert.equal(r.repasseGuiaCentavos, 90000);
  assert.equal(r.sinalCentavos, 30000);
  assert.equal(r.saldoCentavos, 70000);
});

test('as somas sempre fecham, inclusive com desconto Diamond', () => {
  const r = calcularReserva({
    precoBarcoCentavos: 33333,
    precoPassageiroCentavos: 11111,
    qtdPescadores: 3,
    comissaoPercentual: 7,
    sinalPercentual: 30,
    aplicarDescontoDiamond: true,
    descontoDiamondPercentual: 12.5,
  });

  assert.equal(r.valorTotalCentavos - r.descontoCentavos, r.valorLiquidoCentavos);
  assert.equal(r.comissaoCentavos + r.repasseGuiaCentavos, r.valorLiquidoCentavos);
  assert.equal(r.sinalCentavos + r.saldoCentavos, r.valorLiquidoCentavos);
});

test('desconto Diamond só entra quando o cliente é elegível', () => {
  const base = {
    precoBarcoCentavos: 100000,
    precoPassageiroCentavos: 0,
    qtdPescadores: 1,
    comissaoPercentual: 10,
    sinalPercentual: 30,
    descontoDiamondPercentual: 10,
  };
  assert.equal(calcularReserva(base).descontoCentavos, 0);
  assert.equal(
    calcularReserva({ ...base, aplicarDescontoDiamond: true }).descontoCentavos,
    10000,
  );
});

test('entradas inválidas falham cedo, com mensagem clara', () => {
  const base = {
    precoBarcoCentavos: 10000,
    precoPassageiroCentavos: 0,
    qtdPescadores: 1,
    comissaoPercentual: 10,
    sinalPercentual: 30,
  };
  assert.throws(() => calcularReserva({ ...base, qtdPescadores: 0 }), /pescadores/);
  assert.throws(() => calcularReserva({ ...base, comissaoPercentual: 120 }), /comissão/);
  assert.throws(
    () => calcularReserva({ ...base, precoBarcoCentavos: 100.5 }),
    /centavos/,
  );
  assert.throws(
    () => calcularReserva({ ...base, precoBarcoCentavos: 0 }),
    /sem valor/,
  );
});

// =============================================================================
test('rateio da comissão bate ao centavo em qualquer divisão', () => {
  const casos: Array<[number, number, number[]]> = [
    [100000, 10000, [30000, 70000]],
    [99999, 7000, [30000, 69999]],
    [100000, 10000, [100000]],
    [33333, 3333, [10000, 23333]],
    [77777, 5444, [23333, 54444]],
    [1, 1, [1]],
    [100003, 7000, [33334, 33334, 33335]],
  ];

  for (const [liquido, comissao, cobrancas] of casos) {
    const taxas = ratearComissao(liquido, comissao, cobrancas);
    const soma = taxas.reduce((a, b) => a + b, 0);
    assert.equal(soma, comissao, `soma das taxas de ${JSON.stringify(cobrancas)}`);
    assert.ok(
      taxas.every((t, i) => t >= 0 && t <= cobrancas[i]),
      'nenhuma taxa pode ser negativa nem maior que a própria cobrança',
    );
  }
});

test('rateio recusa cobranças que não somam o valor líquido', () => {
  assert.throws(() => ratearComissao(100000, 10000, [30000, 60000]), /somam/);
});

test('vencimento da quitação recua o número certo de dias', () => {
  const pescaria = new Date('2026-09-20T00:00:00Z');
  assert.equal(
    vencimentoQuitacao(pescaria, 7).toISOString().slice(0, 10),
    '2026-09-13',
  );
});

// =============================================================================
test('escala de retenção: cada faixa devolve o previsto', () => {
  const esperado: Array<[number, number]> = [
    [40, 5],
    [30, 5],
    [29, 25],
    [15, 25],
    [14, 50],
    [7, 50],
    [6, 75],
    [3, 75],
    [2, 100],
    [0, 100],
  ];
  for (const [dias, pct] of esperado) {
    assert.equal(
      faixaAplicavel(FAIXAS, dias).retencaoPercentual,
      pct,
      `${dias} dias antes deveria reter ${pct}%`,
    );
  }
});

test('SALVAGUARDA 1: retenção nunca supera o que foi pago', () => {
  // Só o sinal de 30% foi pago, e o cliente cancela em cima da data (100%).
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 30000,
    diasAteAPescaria: 1,
    diasDesdeAReserva: 60,
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
  });

  assert.equal(r.retencaoCentavos, 30000, 'retém no máximo o que entrou');
  assert.equal(r.reembolsoCentavos, 0);
  assert.equal(
    r.retencaoCentavos + r.reembolsoCentavos,
    30000,
    'retenção + reembolso = total pago',
  );
});

test('SALVAGUARDA 2: revenda da data devolve o retido menos a taxa', () => {
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 100000,
    diasAteAPescaria: 10,
    diasDesdeAReserva: 60,
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
  });

  assert.equal(r.retencaoCentavos, 50000);
  assert.equal(r.devolucaoSeRevendidaCentavos, 45000, 'R$ 500 retidos − R$ 50 de taxa');
  assert.equal(
    calcularDevolucaoPorRevenda(r.retencaoCentavos, 100000, 5),
    r.devolucaoSeRevendidaCentavos,
  );
});

test('SALVAGUARDA 3: arrependimento de 7 dias vence a escala', () => {
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 100000,
    diasAteAPescaria: 1, // faixa de 100%
    diasDesdeAReserva: 3, // mas reservou anteontem
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
  });

  assert.equal(r.motivo, 'arrependimento');
  assert.equal(r.retencaoCentavos, 0, 'devolve tudo, inclusive a taxa administrativa');
  assert.equal(r.reembolsoCentavos, 100000);
});

test('arrependimento não vale depois de a pescaria ocorrer', () => {
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 100000,
    diasAteAPescaria: -1, // já passou
    diasDesdeAReserva: 3,
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
  });
  assert.notEqual(r.motivo, 'arrependimento');
  assert.equal(r.retencaoCentavos, 100000);
});

test('não comparecimento retém tudo, mesmo com a data ainda no futuro', () => {
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 100000,
    diasAteAPescaria: 40,
    diasDesdeAReserva: 90,
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
    noShow: true,
  });
  assert.equal(r.motivo, 'no_show');
  assert.equal(r.retencaoCentavos, 100000);
});

test('cancelamento por guia, clima ou autoridade devolve tudo', () => {
  const r = calcularCancelamento({
    valorLiquidoCentavos: 100000,
    totalPagoCentavos: 100000,
    diasAteAPescaria: 0,
    diasDesdeAReserva: 90,
    faixas: FAIXAS,
    taxaAdministrativaPercentual: 5,
    arrependimentoDias: 7,
    semRetencao: true,
  });
  assert.equal(r.motivo, 'sem_retencao');
  assert.equal(r.reembolsoCentavos, 100000);
});

test('em qualquer cenário, retenção + reembolso = total pago', () => {
  for (const dias of [-1, 0, 1, 2, 3, 6, 7, 14, 15, 29, 30, 60]) {
    for (const pago of [0, 30000, 55555, 100000]) {
      for (const noShow of [false, true]) {
        const r = calcularCancelamento({
          valorLiquidoCentavos: 100000,
          totalPagoCentavos: pago,
          diasAteAPescaria: dias,
          diasDesdeAReserva: 90,
          faixas: FAIXAS,
          taxaAdministrativaPercentual: 5,
          arrependimentoDias: 7,
          noShow,
        });
        assert.equal(
          r.retencaoCentavos + r.reembolsoCentavos,
          pago,
          `dias=${dias} pago=${pago} noShow=${noShow}`,
        );
        assert.ok(r.retencaoCentavos >= 0 && r.reembolsoCentavos >= 0);
      }
    }
  }
});

// =============================================================================
test('comissão revertida é proporcional ao valor estornado', () => {
  // Cobrança de R$ 300 com R$ 30 de comissão; estorna metade.
  assert.equal(comissaoRevertida(3000, 15000, 30000), 1500);
  // Estorno integral zera a comissão daquela cobrança.
  assert.equal(comissaoRevertida(3000, 30000, 30000), 3000);
  // Nada estornado, nada revertido.
  assert.equal(comissaoRevertida(3000, 0, 30000), 0);
  assert.throws(() => comissaoRevertida(3000, 40000, 30000), /maior/);
});
