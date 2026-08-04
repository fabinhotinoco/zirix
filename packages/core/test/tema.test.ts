import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  MARCA,
  contraste,
  coresDe,
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

for (const aparencia of ['dia', 'noite'] as Aparencia[]) {
  const cores = coresDe(aparencia);

  for (const par of PARES) {
    test(`${aparencia} · ${par.onde}`, () => {
      const razao = contraste(cores[par.frente], cores[par.fundo]);
      assert.ok(
        razao >= par.minimo,
        `${par.frente} (${cores[par.frente]}) sobre ${par.fundo} (${cores[par.fundo]}) ` +
          `deu ${razao.toFixed(2)}:1, mínimo ${par.minimo}:1`,
      );
    });
  }

  test(`${aparencia} · nenhuma cor faltando`, () => {
    for (const [chave, valor] of Object.entries(cores)) {
      assert.match(valor, /^#[0-9A-Fa-f]{6}$/, `${chave} não é um hexadecimal de 6 dígitos`);
    }
  });
}

test('noite é mais escura que dia', () => {
  // Trocar as duas por engano é fácil e passaria em todo o resto: cada modo é
  // internamente consistente. Só a comparação entre eles pega a inversão.
  assert.ok(
    contraste(MARCA.noite.fundo, '#FFFFFF') > contraste(MARCA.dia.fundo, '#FFFFFF'),
    'o fundo do modo noite deveria estar mais longe do branco que o do modo dia',
  );
});

test('o acento é o mesmo tom nos dois modos, em claridades diferentes', () => {
  // A marca é uma só. Se o ciano da noite virasse laranja no dia, seriam duas
  // marcas — e ninguém repararia olhando um modo de cada vez.
  const matiz = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h =
      max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) % 360 + 360) % 360;
  };
  const diferenca = Math.abs(matiz(MARCA.dia.acento) - matiz(MARCA.noite.acento));
  assert.ok(
    Math.min(diferenca, 360 - diferenca) < 25,
    `os acentos estão a ${diferenca.toFixed(0)}° um do outro — não são a mesma cor`,
  );
});

test('modo híbrido segue o aparelho; os outros dois mandam', () => {
  assert.equal(resolverAparencia('hibrido', 'noite'), 'noite');
  assert.equal(resolverAparencia('hibrido', 'dia'), 'dia');
  assert.equal(resolverAparencia('dia', 'noite'), 'dia');
  assert.equal(resolverAparencia('noite', 'dia'), 'noite');
});
