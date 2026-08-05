import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { indiceDePesca, type Entrada } from '../src/pesca/score.ts';
import { AMBIENTE_VAZIO, type Ambiente } from '../src/pesca/tipos.ts';
import { luaDoDia, solDoDia } from '../src/pesca/astro.ts';
import type { EstadoDaMare } from '../src/pesca/mare.ts';

const JURUJUBA = { lat: -22.9265, lng: -43.1176 };
const DIA = new Date('2026-08-05T09:00:00Z'); // 06:00 em Brasília

const sol = solDoDia(DIA, JURUJUBA.lat, JURUJUBA.lng);
const lua = luaDoDia(DIA, JURUJUBA.lat, JURUJUBA.lng);

const ambiente = (campos: Partial<Ambiente> = {}): Ambiente => ({
  ...AMBIENTE_VAZIO, instante: DIA, ...campos,
});

const mare = (forca: number, movimento: EstadoDaMare['movimento'] = 'enchendo'): EstadoDaMare => ({
  movimento, alturaM: 0.3, forca, proximo: null, anterior: null,
});

const entrada = (campos: Partial<Ambiente>, extras: Partial<Entrada> = {}): Entrada => ({
  ambiente: ambiente(campos), agua: 'salgada', sol, lua, mare: null, ...extras,
});

// --- comportamento diante de dado faltando -----------------------------------

test('sem nenhum dado, diz que não sabe — não diz que está ruim', () => {
  const i = indiceDePesca(entrada({}, { sol: { ...sol, nascer: null, por: null } }));
  // A lua é calculada, então sempre há pelo menos um fator; o que se garante
  // aqui é que a tela consegue distinguir os casos pela lista de fatores.
  assert.ok(i.fatores.length <= 1, `fatores demais para "sem dados": ${i.fatores.length}`);
});

test('campo faltando NÃO conta como zero', () => {
  // Um dia bom em que a altura da onda não veio do provedor precisa continuar
  // sendo um dia bom. Contar o que falta como zero mandaria o pescador ficar em
  // casa por causa de um campo ausente.
  const bons: Partial<Ambiente> = {
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 7,
    nuvens: 50, chuvaMm: 0, chanceChuva: 5, aguaC: 23,
  };
  const comOnda = indiceDePesca(entrada({ ...bons, ondaM: 0.6 }, { mare: mare(0.9) }));
  const semOnda = indiceDePesca(entrada(bons, { mare: mare(0.9) }));

  assert.ok(semOnda.nota > 70, `sem a onda o índice caiu para ${semOnda.nota}`);
  assert.ok(Math.abs(comOnda.nota - semOnda.nota) < 12,
    `a ausência mudou demais: ${comOnda.nota} vs ${semOnda.nota}`);
});

// --- o que o índice precisa distinguir ---------------------------------------

test('dia bom pontua muito mais que dia ruim', () => {
  const bom = indiceDePesca(entrada({
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 7, ondaM: 0.5,
    nuvens: 55, chuvaMm: 0, chanceChuva: 5, aguaC: 23,
  }, { mare: mare(0.95) }));

  const ruim = indiceDePesca(entrada({
    pressaoHpa: 1002, tendenciaPressao: 'subindo', ventoNos: 24, ondaM: 2.6,
    nuvens: 100, chuvaMm: 14, chanceChuva: 95, trovoada: true, aguaC: 15,
  }, { mare: mare(0.05, 'parada') }));

  assert.ok(bom.nota >= 75, `dia bom deu só ${bom.nota}`);
  assert.ok(ruim.nota <= 20, `dia ruim deu ${ruim.nota}`);
  assert.ok(bom.estrelas >= 4 && ruim.estrelas <= 2);
});

test('condição perigosa manda, por melhor que esteja o resto', () => {
  // Amanhecer perfeito, maré cheia enchendo, pressão alta e estável — e
  // trovoada. A média ponderada sozinha devolvia 34, que a tela leria como
  // "ruim, mas dá". A resposta certa é: não saia.
  const i = indiceDePesca(entrada({
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 6, ondaM: 0.4,
    nuvens: 55, aguaC: 23, trovoada: true,
  }, { mare: mare(0.98) }));

  assert.ok(i.nota <= 15, `com trovoada o índice ficou em ${i.nota}`);
  assert.match(i.rotulo, /não vale a saída/i, `rótulo veio "${i.rotulo}"`);
  assert.match(i.rotulo, /trovoada/i, 'o rótulo precisa dizer o motivo');
});

test('o teto explica qual perigo está mandando', () => {
  const mar = indiceDePesca(entrada({
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 8, ondaM: 2.8, aguaC: 23,
  }, { mare: mare(0.9) }));
  assert.ok(mar.nota <= 20, `mar de 2,8 m deu ${mar.nota}`);
  assert.match(mar.rotulo, /mar muito agitado/i);

  const vento = indiceDePesca(entrada({
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 27, ondaM: 0.5, aguaC: 23,
  }, { mare: mare(0.9) }));
  assert.match(vento.rotulo, /vento forte/i);
});

test('o teto não mexe em dia bom', () => {
  const bom = indiceDePesca(entrada({
    pressaoHpa: 1018, tendenciaPressao: 'estavel', ventoNos: 9, ondaM: 0.6,
    nuvens: 50, aguaC: 23,
  }, { mare: mare(0.9) }));
  assert.ok(!/não vale a saída/i.test(bom.rotulo), `rótulo indevido: "${bom.rotulo}"`);
  assert.ok(bom.nota > 70);
});

test('vento parado não é o ideal — brisa leve pontua mais', () => {
  const base = { pressaoHpa: 1015, tendenciaPressao: 'estavel' as const, nuvens: 50 };
  const parado = indiceDePesca(entrada({ ...base, ventoNos: 0 }));
  const brisa = indiceDePesca(entrada({ ...base, ventoNos: 8 }));
  const ventania = indiceDePesca(entrada({ ...base, ventoNos: 26 }));
  assert.ok(brisa.nota > parado.nota, 'brisa tem de superar a calmaria');
  assert.ok(parado.nota > ventania.nota, 'calmaria ainda é melhor que ventania');
});

test('pressão caindo devagar vale MAIS que pressão subindo', () => {
  // Contraintuitivo para quem só olha "vai fazer tempo bom": o peixe come antes
  // da frente chegar, e para depois que ela passa.
  const caindo = indiceDePesca(entrada({ pressaoHpa: 1014, tendenciaPressao: 'caindo', ventoNos: 8 }));
  const subindo = indiceDePesca(entrada({ pressaoHpa: 1014, tendenciaPressao: 'subindo', ventoNos: 8 }));
  assert.ok(caindo.nota > subindo.nota + 5, `caindo ${caindo.nota} vs subindo ${subindo.nota}`);
});

test('maré correndo vale mais que maré parada', () => {
  const base = { pressaoHpa: 1015, ventoNos: 8, ondaM: 0.5 };
  const correndo = indiceDePesca(entrada(base, { mare: mare(1) }));
  const estofa = indiceDePesca(entrada(base, { mare: mare(0.02) }));
  assert.ok(correndo.nota > estofa.nota + 10,
    `correndo ${correndo.nota} vs estofa ${estofa.nota}`);
});

test('onda curta incomoda mais que onda longa da mesma altura', () => {
  const base = { pressaoHpa: 1015, ventoNos: 8, ondaM: 1.6 };
  const longa = indiceDePesca(entrada({ ...base, ondaPeriodoS: 12 }));
  const curta = indiceDePesca(entrada({ ...base, ondaPeriodoS: 4 }));
  assert.ok(longa.nota > curta.nota, `longa ${longa.nota} vs curta ${curta.nota}`);
});

test('trovoada zera o fator chuva', () => {
  const comTrovoada = indiceDePesca(entrada({
    pressaoHpa: 1015, ventoNos: 8, chuvaMm: 1, trovoada: true,
  }));
  const chuvaFator = comTrovoada.fatores.find((f) => f.chave === 'chuva');
  assert.ok(chuvaFator, 'esperava o fator chuva');
  assert.equal(chuvaFator.nota, 0);
  assert.match(chuvaFator.explicacao, /trovoada/i);
});

// --- a diferença entre mar e represa -----------------------------------------

test('água doce não recebe fator de onda nem de maré', () => {
  const doce = indiceDePesca(entrada(
    { pressaoHpa: 1015, ventoNos: 8, ondaM: 0.5, aguaC: 24 },
    { agua: 'doce', mare: mare(0.9) },
  ));
  const chaves = doce.fatores.map((f) => f.chave);
  assert.ok(!chaves.includes('onda'), 'represa não tem ondulação de mar aberto');
  assert.ok(!chaves.includes('mare'), 'represa não tem maré');
  assert.ok(chaves.includes('pressao') && chaves.includes('vento'));
});

test('na represa a pressão pesa mais do que no mar', () => {
  const campos = { pressaoHpa: 1015, ventoNos: 8, nuvens: 50 };
  const noMar = indiceDePesca(entrada(campos, { agua: 'salgada' }));
  const naRepresa = indiceDePesca(entrada(campos, { agua: 'doce' }));
  const peso = (i: typeof noMar) => i.fatores.find((f) => f.chave === 'pressao')?.peso ?? 0;
  assert.ok(peso(naRepresa) > peso(noMar),
    `represa ${peso(naRepresa)} vs mar ${peso(noMar)}`);
});

// --- forma da saída -----------------------------------------------------------

test('a nota nunca sai de 0 a 100 e as estrelas acompanham', () => {
  const extremos: Array<Partial<Ambiente>> = [
    { pressaoHpa: 900, ventoNos: 90, ondaM: 12, chuvaMm: 200, aguaC: -2 },
    { pressaoHpa: 1100, ventoNos: 8, ondaM: 0, chuvaMm: 0, aguaC: 24, nuvens: 60 },
  ];
  for (const campos of extremos) {
    const i = indiceDePesca(entrada(campos, { mare: mare(0.5) }));
    assert.ok(i.nota >= 0 && i.nota <= 100, `nota fora da faixa: ${i.nota}`);
    assert.ok(i.estrelas >= 1 && i.estrelas <= 5, `estrelas fora da faixa: ${i.estrelas}`);
    for (const f of i.fatores) {
      assert.ok(f.nota >= 0 && f.nota <= 100, `fator ${f.chave} com nota ${f.nota}`);
    }
  }
});

test('os fatores vêm ordenados pelo que mais derruba o índice', () => {
  // A tela mostra os primeiros: o pescador precisa ver O QUE está atrapalhando,
  // não uma lista alfabética.
  const i = indiceDePesca(entrada({
    pressaoHpa: 1016, tendenciaPressao: 'estavel', ventoNos: 27, ondaM: 0.4,
    nuvens: 55, chuvaMm: 0, aguaC: 23,
  }, { mare: mare(0.9) }));
  assert.equal(i.fatores[0].chave, 'vento', `o primeiro veio ${i.fatores[0].chave}`);
});

test('cada fator explica a própria nota em uma linha', () => {
  const i = indiceDePesca(entrada({
    pressaoHpa: 1016, tendenciaPressao: 'caindo', ventoNos: 9, ondaM: 0.7,
    ondaPeriodoS: 9, nuvens: 40, chanceChuva: 10, aguaC: 22,
  }, { mare: mare(0.8) }));
  for (const f of i.fatores) {
    assert.ok(f.explicacao.length > 3, `fator ${f.chave} sem explicação`);
    assert.ok(f.nome.length > 2, `fator ${f.chave} sem nome legível`);
  }
});
