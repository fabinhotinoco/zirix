import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { luaDoDia, solDoDia, NOME_DA_FASE } from '../src/pesca/astro.ts';

/**
 * COMO ESTE ARQUIVO ESCOLHE O QUE ESPERAR.
 *
 * A primeira versão destes testes usava horários de efeméride tirados de
 * memória — e dois deles estavam errados, o que fez o teste acusar um código
 * que estava certo. Efeméride lembrada não é efeméride.
 *
 * As âncoras aqui são de dois tipos, e nenhum depende de memória:
 *
 * 1. EVENTOS ASTRONÔMICOS DEFINIDOS. Um eclipse lunar total só acontece na lua
 *    cheia exata; um eclipse solar total, na lua nova exata. Os dois eclipses
 *    de 1999–2000 são datados ao minuto em qualquer registro público, e servem
 *    de padrão-ouro para a fase.
 *
 * 2. PROPRIEDADES FÍSICAS. No equinócio o dia dura ~12h em toda a Terra; o
 *    nascer e o pôr são simétricos em torno do meio-dia solar; a longitude
 *    desloca o horário. Isso vale sempre, e um erro no algoritmo quebra.
 */

/** Jurujuba, Niterói — costeira e oceânica. */
const JURUJUBA = { lat: -22.9265, lng: -43.1176 };
/** Represa de Furnas, MG — água doce. */
const FURNAS = { lat: -20.6667, lng: -46.3167 };

const hhmm = (d: Date | null) =>
  d === null
    ? 'null'
    : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

// --- sol ---------------------------------------------------------------------

test('no equinócio o dia dura cerca de 12 horas, em qualquer latitude', () => {
  // "Dia igual à noite" dá 12h07 na prática, não 12h00: nascer e pôr são
  // marcados pelo bordo superior do disco solar e já com a refração da
  // atmosfera. Um cálculo que devolvesse 12h00 cravado estaria ERRADO.
  for (const [nome, p] of [
    ['Niterói', JURUJUBA],
    ['Furnas', FURNAS],
    ['equador', { lat: 0, lng: -43 }],
    ['Lisboa', { lat: 38.7, lng: -9.1 }],
  ] as const) {
    const sol = solDoDia(new Date('2026-03-20T12:00:00Z'), p.lat, p.lng);
    assert.ok(
      sol.duracaoMinutos > 715 && sol.duracaoMinutos < 740,
      `${nome} no equinócio: ${sol.duracaoMinutos} min`,
    );
  }
});

test('nascer e pôr são simétricos em torno do meio-dia solar', () => {
  const sol = solDoDia(new Date('2026-06-21T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  assert.ok(sol.nascer && sol.por);
  const antes = sol.meioDia.getTime() - sol.nascer.getTime();
  const depois = sol.por.getTime() - sol.meioDia.getTime();
  assert.ok(Math.abs(antes - depois) < 1000, `assimetria de ${(antes - depois) / 1000}s`);
});

test('o solstício de verão é bem mais longo que o de inverno, no Rio', () => {
  const inverno = solDoDia(new Date('2026-06-21T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  const verao = solDoDia(new Date('2026-12-21T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  // Na latitude do Rio a diferença entre o dia mais longo e o mais curto é de
  // cerca de 2h20. Menos que 2h ou mais que 3h denunciaria erro na declinação.
  const diferenca = verao.duracaoMinutos - inverno.duracaoMinutos;
  assert.ok(diferenca > 120 && diferenca < 180, `diferença de ${diferenca} min`);
  assert.ok(inverno.duracaoMinutos > 620 && inverno.duracaoMinutos < 660,
    `inverno com ${inverno.duracaoMinutos} min`);
});

test('a longitude desloca o horário — Furnas amanhece depois de Niterói', () => {
  const dia = new Date('2026-09-10T12:00:00Z');
  const niteroi = solDoDia(dia, JURUJUBA.lat, JURUJUBA.lng);
  const furnas = solDoDia(dia, FURNAS.lat, FURNAS.lng);
  assert.ok(furnas.nascer && niteroi.nascer);
  // 3,2° de longitude = 12,8 minutos de rotação da Terra. A latitude diferente
  // muda um pouco, mas a ordem de grandeza é essa.
  const minutos = (furnas.nascer.getTime() - niteroi.nascer.getTime()) / 60_000;
  assert.ok(minutos > 6 && minutos < 22, `diferença de ${minutos.toFixed(0)} min`);
});

test('a hora azul da manhã termina antes de o sol nascer', () => {
  const sol = solDoDia(new Date('2026-03-15T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  assert.ok(sol.azulManha && sol.nascer, 'esperava hora azul e nascer');
  assert.ok(sol.azulManha[1] < sol.nascer, `azul termina ${hhmm(sol.azulManha[1])}, nascer ${hhmm(sol.nascer)}`);
  assert.ok(sol.azulManha[0] < sol.azulManha[1], 'a hora azul precisa ter duração');
});

test('a hora dourada encosta no nascer e no pôr', () => {
  const sol = solDoDia(new Date('2026-03-15T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  assert.ok(sol.douradaManha && sol.douradaTarde && sol.nascer && sol.por);
  assert.equal(sol.douradaManha[0].getTime(), sol.nascer.getTime());
  assert.equal(sol.douradaTarde[1].getTime(), sol.por.getTime());
  // Em latitude tropical a dourada é curta — o sol sobe quase na vertical.
  const minutos = (sol.douradaManha[1].getTime() - sol.douradaManha[0].getTime()) / 60_000;
  assert.ok(minutos > 15 && minutos < 60, `dourada de ${minutos.toFixed(0)} min`);
});

test('as janelas do dia vêm em ordem: azul, dourada, meio-dia, dourada, azul', () => {
  const s = solDoDia(new Date('2026-11-05T12:00:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  assert.ok(s.azulManha && s.douradaManha && s.douradaTarde && s.azulTarde);
  const ordem = [
    s.azulManha[0], s.azulManha[1],
    s.douradaManha[0], s.douradaManha[1],
    s.meioDia,
    s.douradaTarde[0], s.douradaTarde[1],
    s.azulTarde[0], s.azulTarde[1],
  ].map((d) => d.getTime());
  for (let i = 1; i < ordem.length; i += 1) {
    assert.ok(ordem[i] >= ordem[i - 1], `fora de ordem na posição ${i}`);
  }
});

// --- lua ---------------------------------------------------------------------

test('o eclipse lunar total de 21/01/2000 cai na lua cheia exata', () => {
  // Eclipse lunar total, máximo às 04:44 UTC. Eclipse lunar só existe na cheia.
  const lua = luaDoDia(new Date('2000-01-21T04:44:00Z'), JURUJUBA.lat, JURUJUBA.lng);
  assert.equal(lua.fase, 'cheia', `veio ${NOME_DA_FASE[lua.fase]}`);
  assert.ok(lua.iluminacao > 0.999, `iluminação ${(lua.iluminacao * 100).toFixed(2)}%`);
});

test('o eclipse solar total de 11/08/1999 cai na lua nova exata', () => {
  // Eclipse solar total sobre a Europa, máximo às 11:03 UTC. Só existe na nova.
  const lua = luaDoDia(new Date('1999-08-11T11:03:00Z'), 48.0, 2.0);
  assert.equal(lua.fase, 'nova', `veio ${NOME_DA_FASE[lua.fase]}`);
  assert.ok(lua.iluminacao < 0.001, `iluminação ${(lua.iluminacao * 100).toFixed(2)}%`);
});

test('a lua nova de 06/01/2000 também é reconhecida', () => {
  // Época de referência clássica das tabelas lunares: nova às 18:14 UTC.
  const lua = luaDoDia(new Date('2000-01-06T18:14:00Z'), FURNAS.lat, FURNAS.lng);
  assert.equal(lua.fase, 'nova');
  assert.ok(lua.idadeDias < 0.5 || lua.idadeDias > 29, `idade ${lua.idadeDias.toFixed(2)} dias`);
});

test('a iluminação percorre o ciclo: escurece, clareia, escurece', () => {
  const nova = new Date('2000-01-06T18:14:00Z').getTime();
  const em = (dias: number) =>
    luaDoDia(new Date(nova + dias * 86_400_000), JURUJUBA.lat, JURUJUBA.lng).iluminacao;

  assert.ok(em(0) < 0.01, 'na nova está escura');
  assert.ok(em(0) < em(4) && em(4) < em(11), 'da nova até a cheia ela clareia');
  assert.ok(em(14.8) > 0.99, 'meio ciclo depois está cheia');
  assert.ok(em(22) < em(14.8), 'depois da cheia volta a escurecer');
  assert.ok(em(29.5) < 0.02, 'e fecha o ciclo escura de novo');
});

test('os quartos têm metade do disco iluminado', () => {
  const nova = new Date('2000-01-06T18:14:00Z').getTime();
  const quartoCrescente = luaDoDia(
    new Date(nova + 7.38 * 86_400_000), JURUJUBA.lat, JURUJUBA.lng,
  );
  assert.ok(
    Math.abs(quartoCrescente.iluminacao - 0.5) < 0.06,
    `quarto crescente com ${(quartoCrescente.iluminacao * 100).toFixed(0)}%`,
  );
  assert.ok(quartoCrescente.fracao > 0 && quartoCrescente.fracao < 0.5,
    'antes da cheia a fração fica na primeira metade do ciclo');
});

test('a idade da lua nunca sai do mês sinódico', () => {
  for (let d = 0; d < 60; d += 2) {
    const lua = luaDoDia(new Date(Date.UTC(2026, 4, 1) + d * 86_400_000), FURNAS.lat, FURNAS.lng);
    assert.ok(lua.idadeDias >= 0 && lua.idadeDias <= 29.6, `idade ${lua.idadeDias}`);
    assert.ok(lua.iluminacao >= 0 && lua.iluminacao <= 1, `iluminação ${lua.iluminacao}`);
  }
});

test('o nascer da lua atrasa dia a dia, e nunca vem data inválida', () => {
  const base = Date.UTC(2026, 2, 10);
  const horarios: number[] = [];
  for (let d = 0; d < 6; d += 1) {
    const lua = luaDoDia(new Date(base + d * 86_400_000), JURUJUBA.lat, JURUJUBA.lng);
    for (const t of [lua.nascer, lua.ocaso]) {
      if (t) assert.ok(!Number.isNaN(t.getTime()), 'horário lunar inválido');
    }
    if (lua.nascer) horarios.push(lua.nascer.getUTCHours() * 60 + lua.nascer.getUTCMinutes());
  }
  assert.ok(horarios.length >= 4, 'esperava nascer da lua na maioria dos dias');
  for (let i = 1; i < horarios.length; i += 1) {
    const delta = horarios[i] - horarios[i - 1];
    // ~50 min/dia é o atraso conhecido. A virada de meia-noite dá delta negativo.
    if (delta > 0) assert.ok(delta > 15 && delta < 100, `atraso de ${delta} min`);
  }
});
