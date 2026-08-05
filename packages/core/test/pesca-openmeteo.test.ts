import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { emNos, tendencia, traduzirOpenMeteo } from '../src/pesca/openmeteo.ts';

const HORAS = ['2026-08-05T00:00', '2026-08-05T01:00', '2026-08-05T02:00',
               '2026-08-05T03:00', '2026-08-05T04:00', '2026-08-05T05:00'];

const tempo = (extra: Record<string, unknown> = {}) => ({
  hourly: {
    time: HORAS,
    temperature_2m: [22, 22, 23, 23, 24, 24],
    pressure_msl: [1018, 1018, 1017, 1017, 1016, 1016],
    wind_speed_10m: [8, 9, 9, 10, 10, 11],
    wind_gusts_10m: [12, 13, 13, 14, 15, 15],
    wind_direction_10m: [45, 50, 50, 55, 60, 60],
    cloud_cover: [40, 45, 45, 50, 55, 55],
    uv_index: [0, 0, 0, 1, 3, 5],
    visibility: [24000, 24000, 20000, 20000, 18000, 18000],
    precipitation_probability: [10, 10, 15, 15, 20, 20],
    precipitation: [0, 0, 0, 0.2, 0.4, 0.4],
    weather_code: [2, 2, 3, 3, 61, 95],
    ...extra,
  },
});

const marComDados = () => ({
  hourly: {
    time: HORAS,
    wave_height: [0.5, 0.6, 0.6, 0.7, 0.7, 0.8],
    wave_period: [9, 9, 9, 10, 10, 10],
    wave_direction: [135, 135, 140, 140, 145, 145],
    sea_surface_temperature: [23, 23, 23, 23.5, 23.5, 23.5],
    sea_level_height_msl: [0.1, 0.3, 0.5, 0.55, 0.4, 0.2],
    ocean_current_velocity: [1.852, 1.852, 3.704, 3.704, 1.852, 1.852], // km/h
    ocean_current_direction: [200, 200, 210, 210, 215, 215],
  },
});

/** Água interior: o serviço responde 200 com a série inteira de nulos. */
const marSemDados = () => ({
  hourly: {
    time: HORAS,
    wave_height: [null, null, null, null, null, null],
    wave_period: [null, null, null, null, null, null],
    sea_surface_temperature: [null, null, null, null, null, null],
    sea_level_height_msl: [null, null, null, null, null, null],
  },
});

// --- unidades ----------------------------------------------------------------

test('a corrente vem em km/h e é convertida para nós', () => {
  // 1,852 km/h é exatamente 1 nó. Errar isto faria a tela avisar "corrente
  // forte" num dia de água parada.
  const { horas } = traduzirOpenMeteo(tempo(), marComDados());
  assert.ok(Math.abs((horas[0].correnteNos ?? 0) - 1) < 0.001, `veio ${horas[0].correnteNos}`);
  assert.ok(Math.abs((horas[2].correnteNos ?? 0) - 2) < 0.001, `veio ${horas[2].correnteNos}`);
});

test('o vento NÃO é convertido — já vem em nós', () => {
  // O pedido usa wind_speed_unit=kn. Converter de novo dividiria por 1,852 e
  // transformaria 20 nós de vento forte em 11 nós de brisa.
  const { horas } = traduzirOpenMeteo(tempo(), null);
  assert.equal(horas[0].ventoNos, 8);
  assert.equal(horas[5].ventoNos, 11);
});

test('a visibilidade vem em metros e é mostrada em quilômetros', () => {
  const { horas } = traduzirOpenMeteo(tempo(), null);
  assert.equal(horas[0].visibilidadeKm, 24);
  assert.equal(horas[4].visibilidadeKm, 18);
});

test('emNos e o nulo', () => {
  assert.equal(emNos(null), null);
  assert.ok(Math.abs((emNos(18.52) ?? 0) - 10) < 0.001);
});

// --- pressão -----------------------------------------------------------------

test('a tendência da pressão compara com três horas atrás', () => {
  const caindo = [1020, 1020, 1019, 1018, 1017, 1016];
  assert.equal(tendencia(caindo, 5), 'caindo', '4 hPa abaixo de 3h atrás');
  assert.equal(tendencia(caindo, 2), null, 'antes da 3ª hora não há com o que comparar');

  const subindo = [1000, 1001, 1002, 1004, 1006, 1008];
  assert.equal(tendencia(subindo, 5), 'subindo');

  // Ruído de meio hPa não é tendência.
  const estavel = [1015, 1015.2, 1014.9, 1015.3, 1015.1, 1015.4];
  assert.equal(tendencia(estavel, 5), 'estavel');
});

test('pressão faltando não vira tendência inventada', () => {
  assert.equal(tendencia([null, null, null, 1015], 3), null);
  assert.equal(tendencia([1015, 1015, 1015, null], 3), null);
});

// --- cobertura marinha -------------------------------------------------------

test('ponto de mar é reconhecido pela altura de onda', () => {
  const t = traduzirOpenMeteo(tempo(), marComDados());
  assert.equal(t.temDadosDeMar, true);
  assert.equal(t.horas[0].ondaM, 0.5);
  assert.equal(t.horas[0].aguaC, 23);
  assert.equal(t.nivelDoMar.length, 6);
});

test('água interior: resposta 200 com nulos NÃO conta como mar', () => {
  // O serviço marinho responde para qualquer coordenada. Confiar no código 200
  // faria a represa ganhar tábua de maré.
  const t = traduzirOpenMeteo(tempo(), marSemDados());
  assert.equal(t.temDadosDeMar, false);
  assert.deepEqual(t.nivelDoMar, []);
  for (const h of t.horas) {
    assert.equal(h.ondaM, null);
    assert.equal(h.nivelMarM, null);
    assert.equal(h.aguaC, null);
  }
});

test('sem resposta marinha nenhuma, o resto continua', () => {
  const t = traduzirOpenMeteo(tempo(), null);
  assert.equal(t.temDadosDeMar, false);
  assert.equal(t.horas.length, 6);
  assert.equal(t.horas[0].temperaturaC, 22);
  assert.equal(t.horas[0].pressaoHpa, 1018);
});

test('as horas do mar são casadas por instante, não por posição', () => {
  // As duas séries podem começar em horas diferentes. Casar por índice poria a
  // onda das 3h no registro da meia-noite — erro que não aparece em lugar
  // nenhum, porque o número continua plausível.
  const marDeslocado = {
    hourly: {
      time: HORAS.slice(2), // começa às 02:00
      wave_height: [2.2, 2.3, 2.4, 2.5],
      wave_period: [7, 7, 7, 7],
      sea_surface_temperature: [21, 21, 21, 21],
      sea_level_height_msl: [0.5, 0.55, 0.4, 0.2],
    },
  };
  const { horas } = traduzirOpenMeteo(tempo(), marDeslocado);
  assert.equal(horas[0].ondaM, null, 'a meia-noite não tem dado de mar');
  assert.equal(horas[1].ondaM, null, 'a 1h também não');
  assert.equal(horas[2].ondaM, 2.2, 'a onda das 2h é a primeira da série marinha');
  assert.equal(horas[3].ondaM, 2.3);
});

// --- trovoada ----------------------------------------------------------------

test('o código WMO de trovoada vira o sinal de perigo', () => {
  const { horas } = traduzirOpenMeteo(tempo(), null);
  assert.equal(horas[0].trovoada, false, 'código 2 é céu parcialmente nublado');
  assert.equal(horas[4].trovoada, false, 'código 61 é chuva fraca, não trovoada');
  assert.equal(horas[5].trovoada, true, 'código 95 é trovoada');
});

test('sem código do tempo, trovoada é desconhecida — não é "não"', () => {
  const semCodigo = tempo({ weather_code: [null, null, null, null, null, null] });
  const { horas } = traduzirOpenMeteo(semCodigo, null);
  assert.equal(horas[0].trovoada, null);
});

// --- resistência a resposta quebrada ----------------------------------------

test('resposta vazia ou sem forma não derruba a tradução', () => {
  for (const lixo of [null, {}, { hourly: {} }, { hourly: { time: [] } }]) {
    const t = traduzirOpenMeteo(lixo as never, null);
    assert.deepEqual(t.horas, []);
    assert.deepEqual(t.nivelDoMar, []);
    assert.equal(t.temDadosDeMar, false);
  }
});

test('coluna faltando vira nulo, não zero', () => {
  // Zero é um valor: "0 nós de vento" é calmaria, e a tela pontuaria isso.
  // Faltando tem de ser nulo, para o índice tirar o fator da conta.
  const semVento = { hourly: { time: HORAS, temperature_2m: [22, 22, 23, 23, 24, 24] } };
  const { horas } = traduzirOpenMeteo(semVento, null);
  assert.equal(horas[0].ventoNos, null);
  assert.equal(horas[0].nuvens, null);
  assert.equal(horas[0].temperaturaC, 22);
});

test('série mais curta que a das horas não estoura', () => {
  const curta = tempo({ wind_speed_10m: [8, 9] });
  const { horas } = traduzirOpenMeteo(curta, null);
  assert.equal(horas[1].ventoNos, 9);
  assert.equal(horas[4].ventoNos, null, 'além do fim da série, nulo');
});
