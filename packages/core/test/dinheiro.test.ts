import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { formatarBRL, paraCentavos } from '../src/dinheiro.ts';

test('lê as formas que saem de um teclado brasileiro', () => {
  assert.equal(paraCentavos('1.500,50'), 150050);
  assert.equal(paraCentavos('1500,5'), 150050);
  assert.equal(paraCentavos('1500.50'), 150050);
  assert.equal(paraCentavos('1500'), 150000);
  assert.equal(paraCentavos('R$ 80'), 8000);
  assert.equal(paraCentavos('  80,00 '), 8000);
  assert.equal(paraCentavos('0'), 0);
});

test('desfaz a ambiguidade do ponto pelo tamanho do último grupo', () => {
  // Três dígitos depois do ponto é milhar: centavos nunca têm três casas.
  assert.equal(paraCentavos('1.500'), 150000);
  assert.equal(paraCentavos('1.50'), 150);
  assert.equal(paraCentavos('1.5'), 150);
  assert.equal(paraCentavos('1.234.567'), 123456700);
});

test('recusa o que não dá para entender, em vez de chutar', () => {
  // Chutar aqui erraria o preço de um passeio sem que nada depois percebesse.
  for (const entrada of ['', 'abc', '12a', '-5', 'R$', '1,2,3']) {
    assert.equal(paraCentavos(entrada), null, `deveria recusar ${JSON.stringify(entrada)}`);
  }
});

test('não perde centavo por ponto flutuante', () => {
  // 8.070 * 100 dá 806999.9999999999 em ponto flutuante. Truncar perderia um
  // centavo por preço, todo dia, em silêncio.
  assert.equal(paraCentavos('8070,00'), 807000);
  assert.equal(paraCentavos('0,07'), 7);
  assert.equal(paraCentavos('1234567,89'), 123456789);
});

test('formata com milhar e duas casas', () => {
  assert.equal(formatarBRL(0), 'R$ 0,00');
  assert.equal(formatarBRL(7), 'R$ 0,07');
  assert.equal(formatarBRL(8000), 'R$ 80,00');
  assert.equal(formatarBRL(150050), 'R$ 1.500,50');
  assert.equal(formatarBRL(123456789), 'R$ 1.234.567,89');
  assert.equal(formatarBRL(-2500), '-R$ 25,00');
});

test('ler e formatar dão a volta sem perder valor', () => {
  for (const centavos of [0, 1, 99, 100, 8000, 150050, 999999999]) {
    assert.equal(paraCentavos(formatarBRL(centavos)), centavos);
  }
});
