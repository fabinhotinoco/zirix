import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { dominioDe, linkDeParceiro } from '../src/links.ts';

test('aceita link de loja de verdade', () => {
  assert.equal(
    linkDeParceiro('https://loja.exemplo.com.br/varas?ref=pescavertical'),
    'https://loja.exemplo.com.br/varas?ref=pescavertical',
  );
  assert.equal(linkDeParceiro('  https://exemplo.com  '), 'https://exemplo.com/');
});

test('recusa o que não é seguro abrir no aparelho de outra pessoa', () => {
  // javascript: na versão web é execução de código; http: o iOS bloqueia e o
  // botão morre sem explicação; sem ponto no domínio não é endereço público.
  for (const ruim of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://loja.exemplo.com',
    'ftp://loja.exemplo.com',
    'loja.exemplo.com',
    'https://localhost/admin',
    'https://usuario:senha@loja.exemplo.com',
    '',
    '   ',
    'não é link',
  ]) {
    assert.equal(linkDeParceiro(ruim), null, `"${ruim}" deveria ser recusado`);
  }
});

test('o domínio aparece limpo, para quem clica saber para onde vai', () => {
  assert.equal(dominioDe('https://www.loja.exemplo.com.br/x'), 'loja.exemplo.com.br');
  assert.equal(dominioDe('https://pesca.com/a/b'), 'pesca.com');
  assert.equal(dominioDe('nada'), null);
});
