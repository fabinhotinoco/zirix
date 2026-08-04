import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { compararHora, formatarHora, paraHora, rotuloDaHora } from '../src/hora.ts';

test('aceita as formas que a pessoa realmente digita', () => {
  for (const [entrada, esperado] of [
    ['5', '05:00'],
    ['5h', '05:00'],
    ['05', '05:00'],
    ['5:00', '05:00'],
    ['05:00', '05:00'],
    ['5h30', '05:30'],
    ['5:30', '05:30'],
    ['5.30', '05:30'],
    ['5,30', '05:30'],
    ['530', '05:30'],
    ['0530', '05:30'],
    ['  14h  ', '14:00'],
    ['23:59', '23:59'],
    ['0', '00:00'],
  ] as const) {
    assert.equal(paraHora(entrada), esperado, `"${entrada}"`);
  }
});

test('recusa hora que não existe em vez de arredondar calada', () => {
  // 24:00 virando 00:00 mandaria o cliente ao ponto de encontro no dia errado.
  for (const ruim of ['24:00', '25', '10:75', '99', 'cinco', '5h5', '::', '-1', '5h30m', '']) {
    assert.equal(paraHora(ruim), null, `"${ruim}" deveria ser recusada`);
  }
});

test('o formato de saída é sempre o mesmo, para poder ordenar', () => {
  const horas = ['9', '10h', '5h30', '0'].map(paraHora);
  assert.deepEqual([...horas].sort(), ['00:00', '05:30', '09:00', '10:00']);
});

test('formatarHora tira os segundos que o Postgres devolve', () => {
  assert.equal(formatarHora('05:00:00'), '05:00');
  assert.equal(formatarHora('14:30:00'), '14:30');
  assert.equal(formatarHora(null), null);
  assert.equal(formatarHora(undefined), null);
  assert.equal(formatarHora(''), null);
});

test('sem hora marcada, o rótulo diz isso em vez de mentir um horário', () => {
  assert.equal(rotuloDaHora('05:00:00'), 'Saída 05:00');
  assert.equal(rotuloDaHora(null), 'Horário a combinar');
});

test('quem não tem hora vai para o fim da lista, não para o começo', () => {
  // Ordenar nulo como zero colocaria "a combinar" antes da saída das 4h — e a
  // primeira linha da agenda passaria a ser a menos definida do dia.
  const dias = [null, '09:00:00', null, '05:30:00'];
  assert.deepEqual([...dias].sort(compararHora), ['05:30:00', '09:00:00', null, null]);
});
