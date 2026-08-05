import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  amplitudeM,
  estadoDaMare,
  eventosDeMare,
  type PontoDeNivel,
} from '../src/pesca/mare.ts';

const HORA = 3_600_000;
const T0 = Date.UTC(2026, 7, 5, 0, 0, 0);

/**
 * Maré semidiurna sintética: duas preamares e duas baixa-mares por dia, com
 * amplitude de 1,2 m — a ordem de grandeza da Baía de Guanabara.
 *
 * Massa gerada por fórmula, e não copiada de uma tábua real, porque o que se
 * verifica aqui é a EXTRAÇÃO: dada uma curva conhecida, os picos saem no lugar
 * certo? Tábua real testaria o provedor, que é outro assunto.
 */
function mareSintetica(horas = 48, periodoH = 12.42, amplitude = 0.6): PontoDeNivel[] {
  const serie: PontoDeNivel[] = [];
  for (let h = 0; h <= horas; h += 1) {
    serie.push({
      instante: new Date(T0 + h * HORA),
      // Pico em h = 3, pela defasagem de -3.
      nivelM: amplitude * Math.sin(((h - 3) / periodoH) * 2 * Math.PI + Math.PI / 2),
    });
  }
  return serie;
}

test('acha quatro extremos por dia numa maré semidiurna', () => {
  const eventos = eventosDeMare(mareSintetica(24));
  // Em 24h cabem ~1,93 ciclos: 2 preamares e 2 baixa-mares, podendo faltar uma
  // nas pontas da janela.
  assert.ok(eventos.length >= 3 && eventos.length <= 4, `vieram ${eventos.length} eventos`);
});

test('preamar e baixa-mar se alternam, sempre', () => {
  const eventos = eventosDeMare(mareSintetica(72));
  assert.ok(eventos.length >= 10, `poucos eventos: ${eventos.length}`);
  for (let i = 1; i < eventos.length; i += 1) {
    assert.notEqual(
      eventos[i].tipo, eventos[i - 1].tipo,
      `duas ${eventos[i].tipo} seguidas na posição ${i}`,
    );
  }
});

test('o intervalo entre preamares é o do ciclo lunar semidiurno', () => {
  const preamares = eventosDeMare(mareSintetica(72)).filter((e) => e.tipo === 'preamar');
  assert.ok(preamares.length >= 4);
  for (let i = 1; i < preamares.length; i += 1) {
    const horas = (preamares[i].instante.getTime() - preamares[i - 1].instante.getTime()) / HORA;
    // 12h25 é o intervalo de verdade. Tolerância de 20 min cobre o refino
    // parabólico sobre amostragem horária.
    assert.ok(Math.abs(horas - 12.42) < 0.35, `intervalo de ${horas.toFixed(2)} h`);
  }
});

test('o horário do pico não é arredondado para a hora cheia', () => {
  // A defasagem de 3h no seno põe a primeira preamar em h=3 exato; deslocando
  // meia hora, o pico verdadeiro cai em 3h30 e um cálculo sem refino devolveria
  // 3h ou 4h. É esse arredondamento que a parábola existe para evitar.
  const serie: PontoDeNivel[] = [];
  for (let h = 0; h <= 24; h += 1) {
    serie.push({
      instante: new Date(T0 + h * HORA),
      nivelM: 0.6 * Math.sin(((h - 3.5) / 12.42) * 2 * Math.PI + Math.PI / 2),
    });
  }
  const primeira = eventosDeMare(serie).find((e) => e.tipo === 'preamar');
  assert.ok(primeira, 'esperava uma preamar');
  const horas = (primeira.instante.getTime() - T0) / HORA;
  assert.ok(Math.abs(horas - 3.5) < 0.25, `pico em ${horas.toFixed(2)} h, esperado ~3,5`);
});

test('a maré enche antes da preamar e vaza depois dela', () => {
  const serie = mareSintetica(48);
  const eventos = eventosDeMare(serie);
  // Uma preamar do MEIO da série. A primeira não serve: antes dela não existe
  // evento anterior, e ali "parada" é a resposta certa — a função se recusa a
  // afirmar para onde a água vai quando não tem os dois lados.
  const preamar = eventos.slice(1).find((e) => e.tipo === 'preamar');
  assert.ok(preamar);

  const antes = estadoDaMare(serie, new Date(preamar.instante.getTime() - 2 * HORA), eventos);
  const depois = estadoDaMare(serie, new Date(preamar.instante.getTime() + 2 * HORA), eventos);
  assert.equal(antes?.movimento, 'enchendo');
  assert.equal(depois?.movimento, 'vazando');
});

test('a força é máxima na meia-maré e mínima na estofa', () => {
  const serie = mareSintetica(48);
  const eventos = eventosDeMare(serie);
  const a = eventos[1];
  const b = eventos[2];
  const meio = new Date((a.instante.getTime() + b.instante.getTime()) / 2);

  const naEstofa = estadoDaMare(serie, new Date(a.instante.getTime() + 60_000), eventos);
  const naMeia = estadoDaMare(serie, meio, eventos);

  assert.ok(naMeia && naEstofa);
  assert.ok(naMeia.forca > 0.95, `meia-maré com força ${naMeia.forca.toFixed(2)}`);
  assert.ok(naEstofa.forca < 0.1, `estofa com força ${naEstofa.forca.toFixed(2)}`);
  // É este número, e não a altura, que entra no índice de pesca: peixe come com
  // água correndo.
  assert.ok(naMeia.forca > naEstofa.forca);
});

test('a altura interpolada fica entre as amostras vizinhas', () => {
  const serie = mareSintetica(24);
  const meiaHora = new Date(T0 + 5.5 * HORA);
  const estado = estadoDaMare(serie, meiaHora);
  assert.ok(estado);
  const menor = Math.min(serie[5].nivelM, serie[6].nivelM);
  const maior = Math.max(serie[5].nivelM, serie[6].nivelM);
  assert.ok(estado.alturaM >= menor && estado.alturaM <= maior,
    `${estado.alturaM} fora de [${menor}, ${maior}]`);
});

test('sabe dizer qual é a próxima maré e qual foi a última', () => {
  const serie = mareSintetica(48);
  const eventos = eventosDeMare(serie);
  const meio = new Date(T0 + 20 * HORA);
  const estado = estadoDaMare(serie, meio, eventos);
  assert.ok(estado?.proximo && estado.anterior);
  assert.ok(estado.anterior.instante <= meio, 'a anterior tem de ter acontecido');
  assert.ok(estado.proximo.instante > meio, 'a próxima tem de estar por vir');
  assert.notEqual(estado.anterior.tipo, estado.proximo.tipo);
});

test('a amplitude bate com a da curva', () => {
  const eventos = eventosDeMare(mareSintetica(48, 12.42, 0.6));
  const amp = amplitudeM(eventos);
  assert.ok(amp, 'esperava amplitude');
  // Seno de amplitude 0,6 varia de -0,6 a +0,6: 1,2 m entre extremos.
  assert.ok(Math.abs(amp - 1.2) < 0.06, `amplitude ${amp.toFixed(3)} m`);
});

test('série curta demais não vira maré inventada', () => {
  // Água doce e ponto sem cobertura do modelo devolvem série vazia. O que não
  // pode é a tela mostrar uma tábua feita de nada.
  assert.deepEqual(eventosDeMare([]), []);
  assert.equal(estadoDaMare([], new Date()), null);
  assert.equal(amplitudeM([]), null);
});

test('fora da faixa da série, não afirma para onde a água vai', () => {
  const serie = mareSintetica(12);
  const eventos = eventosDeMare(serie);
  const antesDeTudo = estadoDaMare(serie, new Date(T0 - 5 * HORA), eventos);
  assert.equal(antesDeTudo?.movimento, 'parada');
  assert.equal(antesDeTudo?.forca, 0);
});
