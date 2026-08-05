import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { lerODia, type EntradaDoDia } from '../src/pesca/inteligencia.ts';
import { AMBIENTE_VAZIO, type Ambiente, type Local } from '../src/pesca/tipos.ts';
import type { PontoDeNivel } from '../src/pesca/mare.ts';

const JURUJUBA: Local = { nome: 'Jurujuba', lat: -22.9265, lng: -43.1176, agua: 'salgada' };
const FURNAS: Local = { nome: 'Furnas', lat: -20.6667, lng: -46.3167, agua: 'doce' };

const T0 = Date.UTC(2026, 7, 5, 3, 0, 0); // 00:00 em Brasília
const HORA = 3_600_000;

/** Um dia inteiro de condições iguais, para isolar o que se quer testar. */
function dia(campos: Partial<Ambiente>, horas = 24): Ambiente[] {
  return Array.from({ length: horas }, (_, h) => ({
    ...AMBIENTE_VAZIO,
    instante: new Date(T0 + h * HORA),
    ...campos,
  }));
}

function nivelDoMar(horas = 30): PontoDeNivel[] {
  return Array.from({ length: horas }, (_, h) => ({
    instante: new Date(T0 + h * HORA),
    nivelM: 0.6 * Math.sin(((h - 3) / 12.42) * 2 * Math.PI + Math.PI / 2),
  }));
}

const BOM: Partial<Ambiente> = {
  temperaturaC: 24, pressaoHpa: 1017, tendenciaPressao: 'estavel', ventoNos: 8,
  ventoDirecao: 45, nuvens: 45, chanceChuva: 5, chuvaMm: 0, aguaC: 23,
  ondaM: 0.6, ondaPeriodoS: 9, uv: 6, visibilidadeKm: 20,
};

const entrada = (local: Local, campos: Partial<Ambiente>, extras: Partial<EntradaDoDia> = {}): EntradaDoDia => ({
  local,
  horas: dia(campos),
  nivelDoMar: local.agua === 'salgada' ? nivelDoMar() : [],
  referencia: new Date(T0 + 9 * HORA), // 06:00 em Brasília
  ...extras,
});

// --- a leitura do dia --------------------------------------------------------

test('produz uma leitura completa de um dia bom no mar', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  assert.ok(l.indice.nota > 60, `índice ${l.indice.nota}`);
  assert.equal(l.horas.length, 24, 'uma nota por hora do dia');
  assert.ok(l.sol.nascer && l.sol.por, 'sol calculado');
  assert.ok(l.mares.length >= 3, `poucas marés: ${l.mares.length}`);
  assert.ok(l.mare, 'estado da maré no instante de referência');
  assert.ok(l.especies.length > 0, 'espécies do local');
  assert.ok(l.melhorJanela, 'janela do dia');
  assert.ok(l.resumo.length > 40, 'resumo com conteúdo');
  assert.ok(l.recomendacao.length > 40, 'recomendação com conteúdo');
});

test('o "agora" é a hora mais próxima da referência, não a primeira do dia', () => {
  // Quem abre o aplicativo às 6h não pode ver a condição da meia-noite.
  const l = lerODia(entrada(JURUJUBA, BOM));
  assert.ok(l.agora);
  const distanciaH = Math.abs(l.agora.instante.getTime() - l.dia.getTime()) / HORA;
  assert.ok(distanciaH <= 0.5, `a hora escolhida está a ${distanciaH} h da referência`);
});

// --- mar x represa -----------------------------------------------------------

test('água doce não produz tábua de maré nem espécies de mar', () => {
  const l = lerODia(entrada(FURNAS, { ...BOM, ondaM: null }));
  assert.deepEqual(l.mares, [], 'represa não tem maré');
  assert.equal(l.mare, null);
  const nomes = l.especies.map((f) => f.especie.chave);
  assert.ok(nomes.includes('tucunare'), 'esperava tucunaré em represa');
  assert.ok(!nomes.includes('robalo'), 'robalo não vive em represa de Minas');
  assert.ok(!/maré/i.test(l.resumo), `o resumo falou de maré em água doce: "${l.resumo}"`);
});

test('água salgada traz espécies costeiras e fala da maré', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  const nomes = l.especies.map((f) => f.especie.chave);
  assert.ok(nomes.includes('robalo'));
  assert.ok(!nomes.includes('tucunare'), 'tucunaré não é peixe de Jurujuba');
  assert.match(l.resumo, /maré/i, 'no mar o resumo precisa falar da maré');
});

// --- alertas -----------------------------------------------------------------

test('condições perigosas viram alerta, e o perigo vem primeiro', () => {
  const l = lerODia(entrada(JURUJUBA, {
    ...BOM, ventoNos: 27, rajadaNos: 42, ondaM: 2.8, trovoada: true,
    visibilidadeKm: 0.5, uv: 12,
  }));
  const chaves = l.alertas.map((a) => a.chave);
  for (const esperado of ['trovoada', 'vento', 'onda', 'neblina', 'uv', 'rajada']) {
    assert.ok(chaves.includes(esperado), `faltou o alerta de ${esperado}`);
  }
  assert.equal(l.alertas[0].nivel, 'perigo', 'o primeiro alerta tem de ser de perigo');
});

test('dia tranquilo não inventa alerta', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  const perigos = l.alertas.filter((a) => a.nivel === 'perigo');
  assert.equal(perigos.length, 0, `alertas indevidos: ${perigos.map((p) => p.texto).join(', ')}`);
});

test('com perigo, a recomendação manda não sair', () => {
  const l = lerODia(entrada(JURUJUBA, { ...BOM, trovoada: true }));
  assert.match(l.recomendacao, /não sair/i, `recomendação veio: "${l.recomendacao}"`);
  assert.ok(l.indice.nota <= 15, `índice ${l.indice.nota} alto demais com trovoada`);
});

// --- resumo e recomendação ---------------------------------------------------

test('o resumo cita números reais, não frase genérica', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  assert.match(l.resumo, /1017 hPa/, 'esperava a pressão de verdade no resumo');
  assert.match(l.resumo, /8 nós|fraco/i, 'esperava o vento no resumo');
  assert.match(l.resumo, /\d{2}:\d{2}/, 'esperava um horário no resumo');
});

test('a recomendação nomeia espécie, horário e isca', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  const melhor = l.especies[0].especie;
  assert.ok(
    l.recomendacao.toLowerCase().includes(melhor.nome.toLowerCase()),
    `a recomendação não citou ${melhor.nome}: "${l.recomendacao}"`,
  );
  assert.match(l.recomendacao, /isca/i);
});

// --- linha do tempo ----------------------------------------------------------

test('a melhor janela cai onde as notas são de fato mais altas', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  assert.ok(l.melhorJanela);
  const dentro = l.horas.filter(
    (h) => h.instante >= l.melhorJanela!.inicio && h.instante < l.melhorJanela!.fim,
  );
  const mediaDentro = dentro.reduce((s, h) => s + h.indice.nota, 0) / dentro.length;
  const mediaDoDia = l.horas.reduce((s, h) => s + h.indice.nota, 0) / l.horas.length;
  assert.ok(mediaDentro > mediaDoDia, `janela ${mediaDentro} vs dia ${mediaDoDia}`);
});

test('a atividade dos peixes acompanha o índice', () => {
  const bom = lerODia(entrada(JURUJUBA, BOM));
  const ruim = lerODia(entrada(JURUJUBA, {
    ...BOM, pressaoHpa: 1001, tendenciaPressao: 'subindo', ventoNos: 22,
    ondaM: 2.2, nuvens: 100, chuvaMm: 12, aguaC: 15,
  }));
  const ordem = ['muito_baixa', 'baixa', 'media', 'alta', 'muito_alta'];
  assert.ok(
    ordem.indexOf(bom.atividade.nivel) > ordem.indexOf(ruim.atividade.nivel),
    `bom=${bom.atividade.nivel} ruim=${ruim.atividade.nivel}`,
  );
});

// --- resistência a dado faltando ---------------------------------------------

test('sem série nenhuma, não quebra e não inventa', () => {
  const l = lerODia({ local: JURUJUBA, horas: [], nivelDoMar: [], referencia: new Date(T0) });
  assert.equal(l.agora, null);
  assert.equal(l.melhorJanela, null);
  assert.deepEqual(l.alertas, []);
  assert.ok(l.sol.nascer, 'o sol continua sendo calculado — não depende de provedor');
  assert.ok(l.resumo.length > 0, 'o resumo precisa dizer que não sabe');
});

test('sem nível do mar, o resto do dia continua funcionando', () => {
  // Acontece quando o ponto está fora da cobertura do modelo marinho.
  const l = lerODia({ ...entrada(JURUJUBA, BOM), nivelDoMar: [] });
  assert.equal(l.mare, null);
  assert.deepEqual(l.mares, []);
  assert.ok(l.indice.nota > 50, `sem maré o índice caiu para ${l.indice.nota}`);
  assert.ok(l.especies.length > 0);
});

test('espécies fora da faixa de temperatura caem na ordem', () => {
  const quente = lerODia(entrada(JURUJUBA, { ...BOM, aguaC: 28 }));
  const fria = lerODia(entrada(JURUJUBA, { ...BOM, aguaC: 18 }));

  const nota = (l: typeof quente, chave: string) =>
    l.especies.find((f) => f.especie.chave === chave)?.nota ?? 0;

  // Dourado-do-mar quer água quente; anchova aparece no frio.
  assert.ok(nota(quente, 'dourado') > nota(fria, 'dourado'), 'dourado prefere água quente');
  assert.ok(nota(fria, 'anchova') > nota(quente, 'anchova'), 'anchova prefere água fria');
});

test('as espécies vêm ordenadas da mais provável para a menos', () => {
  const l = lerODia(entrada(JURUJUBA, BOM));
  for (let i = 1; i < l.especies.length; i += 1) {
    assert.ok(l.especies[i - 1].nota >= l.especies[i].nota, 'lista fora de ordem');
  }
  for (const f of l.especies) {
    assert.ok(f.nota >= 0 && f.nota <= 100, `nota fora da faixa: ${f.nota}`);
    assert.ok(f.estrelas >= 1 && f.estrelas <= 5);
    assert.ok(f.porque.length > 3, `${f.especie.nome} sem justificativa`);
  }
});
