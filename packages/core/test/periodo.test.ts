import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DIAS_DA_SEMANA,
  deslocar,
  diasDaSemana,
  gradeDoMes,
  hoje,
  intervalo,
  intervaloVisivel,
  mesDe,
  paraBR,
  rotulo,
} from '../src/periodo.ts';

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

test('a grade do mês é retangular e começa no domingo', () => {
  const g = gradeDoMes('2026-03-12');
  assert.ok(g.every((sem) => sem.length === 7), 'toda semana tem sete dias');
  assert.equal(g[0][0], '2026-03-01'); // 1º de março de 2026 é domingo
  assert.equal(g[g.length - 1][6], '2026-04-04');
});

test('a grade estende para os meses vizinhos quando precisa', () => {
  // Fevereiro de 2026 começa num domingo e tem 28 dias: quatro semanas exatas.
  assert.equal(gradeDoMes('2026-02-10').length, 4);
  // Agosto de 2026 começa num sábado: a primeira semana traz seis dias de julho.
  const ago = gradeDoMes('2026-08-15');
  assert.equal(ago[0][0], '2026-07-26');
  assert.equal(ago[0][6], '2026-08-01');
});

test('a grade cobre o mês inteiro, sem buraco nem repetição', () => {
  const dias = gradeDoMes('2026-05-15').flat();
  assert.equal(new Set(dias).size, dias.length, 'nenhum dia repetido');
  for (let i = 1; i < dias.length; i++) {
    const anterior = new Date(`${dias[i - 1]}T12:00:00Z`).getTime();
    const atual = new Date(`${dias[i]}T12:00:00Z`).getTime();
    assert.equal(atual - anterior, 86_400_000, `salto entre ${dias[i - 1]} e ${dias[i]}`);
  }
  assert.ok(dias.includes('2026-05-01') && dias.includes('2026-05-31'));
});

test('o intervalo buscado cobre as pontas visíveis da grade', () => {
  // Buscar só o mês deixaria as casas vizinhas vazias — e casa vazia é
  // indistinguível de dia sem saída.
  const v = intervaloVisivel('mes', '2026-08-15');
  assert.equal(v.de, '2026-07-26');
  assert.equal(v.ate, '2026-09-05');
  // Semana e dia não têm pontas: o visível é o próprio período.
  assert.deepEqual(intervaloVisivel('semana', '2026-03-12'), intervalo('semana', '2026-03-12'));
  assert.deepEqual(intervaloVisivel('dia', '2026-03-12'), intervalo('dia', '2026-03-12'));
});

test('a semana tem sete dias e os cabeçalhos batem', () => {
  const d = diasDaSemana('2026-03-12');
  assert.equal(d.length, 7);
  assert.equal(d[0], '2026-03-08');
  assert.equal(d[6], '2026-03-14');
  assert.equal(DIAS_DA_SEMANA.length, 7);
});

test('mesDe separa o que é do mês em exibição', () => {
  assert.equal(mesDe('2026-08-01'), '2026-08');
  assert.notEqual(mesDe('2026-07-26'), mesDe('2026-08-01'));
});
