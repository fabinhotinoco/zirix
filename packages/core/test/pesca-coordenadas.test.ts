import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  escreverCoordenada,
  lerCoordenada,
  pareceForaDoBrasil,
} from '../src/pesca/coordenadas.ts';

/** Jurujuba, Niterói — o ponto do primeiro guia. */
const ALVO = { lat: -22.9265, lng: -43.1176 };

const perto = (c: { lat: number; lng: number } | null, esperado = ALVO, tol = 0.01) => {
  assert.ok(c, 'esperava uma coordenada, veio null');
  assert.ok(Math.abs(c.lat - esperado.lat) < tol, `lat ${c.lat} ≠ ${esperado.lat}`);
  assert.ok(Math.abs(c.lng - esperado.lng) < tol, `lng ${c.lng} ≠ ${esperado.lng}`);
};

test('lê o formato que o Google Maps copia', () => {
  perto(lerCoordenada('-22.9265, -43.1176'));
  perto(lerCoordenada('-22.9265,-43.1176'));
  perto(lerCoordenada('  -22.9265 , -43.1176  '));
});

test('lê separado por espaço, sem vírgula nenhuma', () => {
  perto(lerCoordenada('-22.9265 -43.1176'));
});

test('lê com vírgula decimal, do jeito brasileiro', () => {
  // Aqui há TRÊS vírgulas e cada uma quer dizer uma coisa. É o caso que um
  // `split(',')` ingênuo transforma em quatro pedaços e devolve lixo.
  perto(lerCoordenada('-22,9265, -43,1176'));
  perto(lerCoordenada('-22,9265; -43,1176'));
  perto(lerCoordenada('-22,9265 / -43,1176'));
});

test('lê link do Google Maps', () => {
  perto(lerCoordenada('https://www.google.com/maps/@-22.9265,-43.1176,17z'));
  perto(lerCoordenada(
    'https://www.google.com/maps/place/Jurujuba/@-22.9265,-43.1176,15z/data=!3m1!4b1',
  ));
  perto(lerCoordenada('https://maps.google.com/?q=-22.9265,-43.1176'));
});

test('link com o par em !3d!4d — o formato de "compartilhar"', () => {
  perto(lerCoordenada(
    'https://www.google.com/maps/place/X/@-22.5,-43.5,17z/data=!4m6!3m5!1s0x0!8m2!3d-22.9265!4d-43.1176',
  ));
});

test('lê graus, minutos e segundos', () => {
  // 22°55'35.4"S 43°07'03.4"W é o mesmo ponto, no formato que o Google mostra
  // quando se clica com o botão direito.
  perto(lerCoordenada('22°55\'35.4"S 43°07\'03.4"W'));
  perto(lerCoordenada('22° 55\' 35.4" S, 43° 07\' 03.4" O'));
});

test('recusa em vez de chutar', () => {
  // Previsão do lugar errado é pior que previsão nenhuma, e ninguém confere
  // coordenada depois de salva.
  for (const lixo of ['', '   ', 'Niterói', 'abc, def', '-22.9265', '1 2 3',
                      '-95, -43', '-22, -200', 'https://exemplo.com']) {
    assert.equal(lerCoordenada(lixo), null, `aceitou "${lixo}"`);
  }
});

test('rejeita valor fora da faixa geográfica', () => {
  assert.equal(lerCoordenada('-91, -43'), null, 'latitude não passa de 90');
  assert.equal(lerCoordenada('-22, 181'), null, 'longitude não passa de 180');
  perto(lerCoordenada('-90, -180'), { lat: -90, lng: -180 });
});

test('escreve de volta num formato que dá para conferir', () => {
  assert.equal(escreverCoordenada(ALVO), '-22.92650, -43.11760');
  // O que se escreve tem de ser lido de volta igual.
  perto(lerCoordenada(escreverCoordenada(ALVO)));
});

test('avisa quando o ponto cai fora do Brasil', () => {
  assert.equal(pareceForaDoBrasil(ALVO), false, 'Jurujuba é no Brasil');
  assert.equal(pareceForaDoBrasil({ lat: -20.6667, lng: -46.3167 }), false, 'Furnas também');
  // O engano mais comum: colar o par invertido. Cai no Atlântico Sul, e a
  // previsão sai completa e completamente errada.
  assert.equal(pareceForaDoBrasil({ lat: -43.1176, lng: -22.9265 }), true);
  assert.equal(pareceForaDoBrasil({ lat: 48.85, lng: 2.35 }), true, 'Paris');
});

test('o hemisfério vem do rumo, não do sinal', () => {
  const norte = lerCoordenada('10°00\'00"N 50°00\'00"W');
  assert.ok(norte);
  assert.ok(norte.lat > 0, 'N é positivo');
  assert.ok(norte.lng < 0, 'W é negativo');

  const leste = lerCoordenada('10°00\'00"S 50°00\'00"L');
  assert.ok(leste);
  assert.ok(leste.lat < 0, 'S é negativo');
  assert.ok(leste.lng > 0, 'L (leste) é positivo');
});
