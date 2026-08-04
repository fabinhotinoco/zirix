import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { deslocar, hoje, intervalo, paraBR, rotulo } from '../src/periodo.ts';

test('dia é ele mesmo', () => {
  assert.deepEqual(intervalo('dia', '2026-03-12'), { de: '2026-03-12', ate: '2026-03-12' });
});

test('semana vai de domingo a sábado', () => {
  // 12/03/2026 é uma quinta.
  assert.deepEqual(intervalo('semana', '2026-03-12'), { de: '2026-03-08', ate: '2026-03-14' });
  // O próprio domingo não recua uma semana inteira.
  assert.deepEqual(intervalo('semana', '2026-03-08'), { de: '2026-03-08', ate: '2026-03-14' });
  // Nem o sábado avança.
  assert.deepEqual(intervalo('semana', '2026-03-14'), { de: '2026-03-08', ate: '2026-03-14' });
});

test('semana atravessa a virada do mês e do ano', () => {
  assert.deepEqual(intervalo('semana', '2026-01-01'), { de: '2025-12-28', ate: '2026-01-03' });
});

test('mês vai do dia 1 ao último, inclusive fevereiro bissexto', () => {
  assert.deepEqual(intervalo('mes', '2026-03-12'), { de: '2026-03-01', ate: '2026-03-31' });
  assert.deepEqual(intervalo('mes', '2026-02-05'), { de: '2026-02-01', ate: '2026-02-28' });
  assert.deepEqual(intervalo('mes', '2028-02-05'), { de: '2028-02-01', ate: '2028-02-29' });
  assert.deepEqual(intervalo('mes', '2026-04-30'), { de: '2026-04-01', ate: '2026-04-30' });
});

test('deslocar dia e semana', () => {
  assert.equal(deslocar('dia', '2026-03-12', 1), '2026-03-13');
  assert.equal(deslocar('dia', '2026-03-01', -1), '2026-02-28');
  assert.equal(deslocar('semana', '2026-03-12', 1), '2026-03-19');
  assert.equal(deslocar('semana', '2026-01-01', -1), '2025-12-25');
});

test('deslocar mês não pula fevereiro', () => {
  // O erro clássico: 31/01 + 1 mês vira 03/03, e fevereiro some da navegação.
  assert.equal(deslocar('mes', '2026-01-31', 1), '2026-02-01');
  assert.equal(deslocar('mes', '2026-03-31', -1), '2026-02-01');
  assert.equal(deslocar('mes', '2026-12-15', 1), '2027-01-01');
  assert.equal(deslocar('mes', '2026-01-15', -1), '2025-12-01');
});

test('doze passos de mês voltam ao mesmo mês do ano seguinte', () => {
  let d = '2026-01-31';
  for (let i = 0; i < 12; i++) d = deslocar('mes', d, 1);
  assert.equal(d, '2027-01-01');
});

test('rótulos', () => {
  assert.equal(rotulo('dia', '2026-03-12'), '12/03/2026');
  assert.equal(rotulo('semana', '2026-03-12'), '08 a 14/03/2026');
  assert.equal(rotulo('semana', '2026-01-01'), '28/12 a 03/01/2026');
  assert.equal(rotulo('mes', '2026-03-12'), 'março de 2026');
});

test('paraBR', () => {
  assert.equal(paraBR('2026-03-05'), '05/03/2026');
});

test('hoje usa o calendário de quem olha, não o UTC', () => {
  // 31/12 às 21h em São Paulo (UTC-3) já é 1º de janeiro em UTC. Quem está
  // olhando a tela ainda está no dia 31, e é esse dia que a agenda tem de abrir.
  const véspera = new Date(2026, 11, 31, 21, 0, 0);
  assert.equal(hoje(véspera), '2026-12-31');
});
