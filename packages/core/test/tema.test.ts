import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  PALETAS,
  contraste,
  coresDe,
  paletaPorNome,
  resolverAparencia,
  type Aparencia,
  type Cores,
} from '../src/tema.ts';

/**
 * O teste que impede o bug que já aconteceu: texto branco sobre cinza claro
 * deu 1,4:1 e o botão virou um retângulo vazio para quem estava usando. Aqui
 * cada par que aparece na tela é medido contra a WCAG antes de subir.
 *
 * 4,5:1 é o mínimo para texto corrido; 3:1 para texto grande e para elemento
 * de interface que só precisa ser distinguido do fundo.
 */

const TEXTO = 4.5;
const INTERFACE = 3;

interface Par {
  frente: keyof Cores;
  fundo: keyof Cores;
  minimo: number;
  onde: string;
}

const PARES: Par[] = [
  { frente: 'texto', fundo: 'fundo', minimo: TEXTO, onde: 'texto na tela' },
  { frente: 'texto', fundo: 'superficie', minimo: TEXTO, onde: 'texto no cartão' },
  { frente: 'texto', fundo: 'superficieAlta', minimo: TEXTO, onde: 'texto no campo' },
  { frente: 'textoSuave', fundo: 'fundo', minimo: TEXTO, onde: 'texto secundário na tela' },
  { frente: 'textoSuave', fundo: 'superficie', minimo: TEXTO, onde: 'texto secundário no cartão' },
  { frente: 'acentoTexto', fundo: 'acento', minimo: TEXTO, onde: 'texto do botão principal' },
  { frente: 'acento', fundo: 'fundo', minimo: INTERFACE, onde: 'botão e link na tela' },
  { frente: 'acento', fundo: 'superficie', minimo: INTERFACE, onde: 'link dentro do cartão' },
  { frente: 'acento', fundo: 'acentoSuave', minimo: TEXTO, onde: 'texto do selo tingido' },
  { frente: 'erro', fundo: 'fundo', minimo: TEXTO, onde: 'mensagem de erro' },
  { frente: 'erro', fundo: 'superficie', minimo: TEXTO, onde: 'erro dentro do cartão' },
  { frente: 'sucesso', fundo: 'superficie', minimo: INTERFACE, onde: 'confirmação' },
  { frente: 'aviso', fundo: 'superficie', minimo: INTERFACE, onde: 'alerta' },
  { frente: 'borda', fundo: 'superficie', minimo: 1.25, onde: 'borda do cartão' },
];

for (const paleta of PALETAS) {
  for (const aparencia of ['dia', 'noite'] as Aparencia[]) {
    const cores = coresDe(paleta, aparencia);

    for (const par of PARES) {
      test(`${paleta.nome} · ${aparencia} · ${par.onde}`, () => {
        const razao = contraste(cores[par.frente], cores[par.fundo]);
        assert.ok(
          razao >= par.minimo,
          `${par.frente} (${cores[par.frente]}) sobre ${par.fundo} (${cores[par.fundo]}) ` +
            `deu ${razao.toFixed(2)}:1, mínimo ${par.minimo}:1`,
        );
      });
    }

    test(`${paleta.nome} · ${aparencia} · nenhuma cor faltando`, () => {
      for (const [chave, valor] of Object.entries(cores)) {
        assert.match(valor, /^#[0-9A-Fa-f]{6}$/, `${chave} não é um hexadecimal de 6 dígitos`);
      }
    });
  }

  test(`${paleta.nome} · noite é mais escura que dia`, () => {
    // Trocar as duas por engano é fácil e passaria em todo o resto: cada modo
    // é internamente consistente. Só a comparação entre eles pega a inversão.
    assert.ok(
      contraste(paleta.noite.fundo, '#FFFFFF') > contraste(paleta.dia.fundo, '#FFFFFF'),
      'o fundo do modo noite deveria estar mais longe do branco que o do modo dia',
    );
  });
}

test('as três paletas são de fato diferentes', () => {
  const acentos = PALETAS.map((p) => p.noite.acento);
  assert.equal(new Set(acentos).size, PALETAS.length, 'duas paletas com o mesmo acento');
});

test('modo híbrido segue o aparelho; os outros dois mandam', () => {
  assert.equal(resolverAparencia('hibrido', 'noite'), 'noite');
  assert.equal(resolverAparencia('hibrido', 'dia'), 'dia');
  assert.equal(resolverAparencia('dia', 'noite'), 'dia');
  assert.equal(resolverAparencia('noite', 'dia'), 'noite');
});

test('paleta desconhecida cai na primeira em vez de quebrar a tela', () => {
  // Vem do armazenamento do aparelho: um valor antigo ou corrompido não pode
  // deixar o aplicativo sem cor nenhuma.
  assert.equal(paletaPorNome('inexistente').nome, PALETAS[0].nome);
  assert.equal(paletaPorNome('linha').nome, 'linha');
});
