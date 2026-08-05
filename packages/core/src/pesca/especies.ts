/**
 * Favorabilidade por espécie.
 *
 * O índice geral responde "vale a pena sair?". Este arquivo responde a pergunta
 * seguinte, que é a que o pescador realmente faz: **atrás do quê?**
 *
 * Duas tabelas, porque são dois públicos: costeira e oceânica saindo de
 * Jurujuba, e represa. Robalo e tucunaré não dividem a mesma água, e mostrar a
 * lista errada é a maneira mais rápida de perder a confiança de quem entende do
 * assunto.
 *
 * DE ONDE VÊM AS FAIXAS. Temperatura de conforto, preferência de maré, de luz e
 * de lua vêm do que é consenso entre pescadores e da literatura de pesca
 * esportiva brasileira. Não são resultado de modelo estatístico: a plataforma
 * ainda não tem base de capturas. Quando tiver — e ela está sendo coletada em
 * `catches` — estas tabelas passam a ter de onde sair de verdade.
 */

import type { Ambiente, TipoDeAgua } from './tipos.ts';
import type { EstadoDaMare } from './mare.ts';
import type { Lua, Sol } from './astro.ts';

export interface Especie {
  chave: string;
  nome: string;
  agua: TipoDeAgua;
  /** Faixa de temperatura da água em que ela come melhor, em °C. */
  temperatura: [number, number];
  /** Quanto o movimento de água conta para ela, de 0 a 1. */
  dependeDaMare: number;
  /** Quanto a virada de luz conta, de 0 a 1. */
  dependeDaLuz: number;
  /** Quanto a lua conta, de 0 a 1. */
  dependeDaLua: number;
  /** Onde se pesca, para a tela dizer em uma linha. */
  onde: string;
  /** Dica curta que muda com a condição do dia é montada fora; esta é fixa. */
  isca: string;
}

export const ESPECIES: Especie[] = [
  // --- costeira e oceânica (Rio de Janeiro) ---------------------------------
  { chave: 'robalo', nome: 'Robalo', agua: 'salgada', temperatura: [20, 28],
    dependeDaMare: 1, dependeDaLuz: 0.9, dependeDaLua: 0.5,
    onde: 'costão, canal e boca de rio', isca: 'isca de superfície e meia-água' },
  { chave: 'anchova', nome: 'Anchova', agua: 'salgada', temperatura: [17, 24],
    dependeDaMare: 0.8, dependeDaLuz: 0.8, dependeDaLua: 0.4,
    onde: 'arrebentação e pedras', isca: 'jig e isca cortada' },
  { chave: 'olhete', nome: 'Olhete', agua: 'salgada', temperatura: [19, 26],
    dependeDaMare: 0.7, dependeDaLuz: 0.6, dependeDaLua: 0.4,
    onde: 'lajes e parcéis', isca: 'jig pesado e isca viva' },
  { chave: 'garoupa', nome: 'Garoupa', agua: 'salgada', temperatura: [20, 27],
    dependeDaMare: 0.6, dependeDaLuz: 0.4, dependeDaLua: 0.3,
    onde: 'fundo de pedra e naufrágio', isca: 'isca natural no fundo' },
  { chave: 'corvina', nome: 'Corvina', agua: 'salgada', temperatura: [16, 25],
    dependeDaMare: 0.7, dependeDaLuz: 0.5, dependeDaLua: 0.3,
    onde: 'fundo de areia e baía', isca: 'camarão e isca cortada' },
  { chave: 'dourado', nome: 'Dourado-do-mar', agua: 'salgada', temperatura: [24, 30],
    dependeDaMare: 0.3, dependeDaLuz: 0.5, dependeDaLua: 0.2,
    onde: 'oceânica, perto de objeto flutuante', isca: 'corrico e isca viva' },
  { chave: 'albacora', nome: 'Albacora', agua: 'salgada', temperatura: [22, 29],
    dependeDaMare: 0.3, dependeDaLuz: 0.7, dependeDaLua: 0.3,
    onde: 'oceânica, além da plataforma', isca: 'corrico de superfície' },
  { chave: 'xareu', nome: 'Xaréu', agua: 'salgada', temperatura: [21, 29],
    dependeDaMare: 0.8, dependeDaLuz: 0.7, dependeDaLua: 0.3,
    onde: 'canal e píer', isca: 'isca artificial de superfície' },

  // --- água doce (represas de Minas e São Paulo) ----------------------------
  { chave: 'tucunare', nome: 'Tucunaré', agua: 'doce', temperatura: [24, 31],
    dependeDaMare: 0, dependeDaLuz: 0.7, dependeDaLua: 0.3,
    onde: 'galhada e pedral raso', isca: 'hélice e zara de superfície' },
  { chave: 'black_bass', nome: 'Black bass', agua: 'doce', temperatura: [20, 27],
    dependeDaMare: 0, dependeDaLuz: 0.8, dependeDaLua: 0.4,
    onde: 'vegetação e barranco', isca: 'shad e jig' },
  { chave: 'traira', nome: 'Traíra', agua: 'doce', temperatura: [22, 30],
    dependeDaMare: 0, dependeDaLuz: 0.9, dependeDaLua: 0.5,
    onde: 'raso com mato e brejo', isca: 'anti-enrosco de superfície' },
  { chave: 'dourado_rio', nome: 'Dourado', agua: 'doce', temperatura: [22, 28],
    dependeDaMare: 0, dependeDaLuz: 0.7, dependeDaLua: 0.4,
    onde: 'corredeira e foz de tributário', isca: 'colher e isca viva' },
  { chave: 'pintado', nome: 'Pintado', agua: 'doce', temperatura: [20, 28],
    dependeDaMare: 0, dependeDaLuz: 0.9, dependeDaLua: 0.6,
    onde: 'poço fundo, à noite', isca: 'isca natural no fundo' },
  { chave: 'piapara', nome: 'Piapara', agua: 'doce', temperatura: [22, 29],
    dependeDaMare: 0, dependeDaLuz: 0.5, dependeDaLua: 0.3,
    onde: 'correnteza e barranco', isca: 'massa e minhoca' },
  { chave: 'tilapia', nome: 'Tilápia', agua: 'doce', temperatura: [22, 30],
    dependeDaMare: 0, dependeDaLuz: 0.3, dependeDaLua: 0.2,
    onde: 'margem rasa e ninhal', isca: 'massa e ração' },
];

export interface Favorabilidade {
  especie: Especie;
  /** 0 a 100. */
  nota: number;
  estrelas: 1 | 2 | 3 | 4 | 5;
  /** A razão principal da nota, em uma linha. */
  porque: string;
}

/** Quanto a temperatura atual cai dentro da faixa da espécie, de 0 a 1. */
function ajusteDeTemperatura(aguaC: number, [min, max]: [number, number]): number {
  if (aguaC >= min && aguaC <= max) return 1;
  const distancia = aguaC < min ? min - aguaC : aguaC - max;
  // Cada grau fora da faixa custa 12%. A 8 graus fora, a espécie sai da conta.
  return Math.max(0, 1 - distancia * 0.12);
}

export interface EntradaEspecies {
  ambiente: Ambiente;
  agua: TipoDeAgua;
  sol: Sol;
  lua: Lua;
  mare: EstadoDaMare | null;
  /** O índice geral do momento, que puxa todas as espécies para cima ou para baixo. */
  indiceGeral: number;
}

/**
 * As espécies do local, ordenadas da mais provável para a menos.
 *
 * A nota parte do índice geral — dia ruim é dia ruim para todo mundo — e é
 * modulada pelo que cada espécie pede: temperatura, água correndo, luz e lua.
 */
export function favorabilidade(e: EntradaEspecies): Favorabilidade[] {
  const { ambiente: a, sol, lua, mare } = e;

  const forcaMare = mare?.forca ?? null;
  const ateALuz = [sol.nascer, sol.por]
    .filter((d): d is Date => d !== null)
    .map((d) => Math.abs(d.getTime() - a.instante.getTime()) / 60_000);
  const minutosDaLuz = ateALuz.length ? Math.min(...ateALuz) : null;
  const sizigia = 1 - Math.min(lua.fracao, Math.abs(0.5 - lua.fracao), 1 - lua.fracao) / 0.25;

  return ESPECIES.filter((s) => s.agua === e.agua)
    .map((especie): Favorabilidade => {
      let nota = e.indiceGeral;
      const razoes: string[] = [];

      if (a.aguaC !== null) {
        const ajuste = ajusteDeTemperatura(a.aguaC, especie.temperatura);
        nota *= 0.45 + 0.55 * ajuste;
        if (ajuste >= 0.99) razoes.push(`água a ${a.aguaC.toFixed(0)} °C, dentro da faixa dela`);
        else if (ajuste < 0.5) razoes.push(`água a ${a.aguaC.toFixed(0)} °C, fora da faixa dela`);
      }

      if (forcaMare !== null && especie.dependeDaMare > 0) {
        // Espécie de canal para de comer na estofa; espécie de fundo nem nota.
        nota *= 1 - especie.dependeDaMare * 0.35 * (1 - forcaMare);
        if (forcaMare > 0.7 && especie.dependeDaMare > 0.7) razoes.push('maré correndo, que é quando ela come');
        else if (forcaMare < 0.2 && especie.dependeDaMare > 0.7) razoes.push('maré parada atrapalha');
      }

      if (minutosDaLuz !== null && especie.dependeDaLuz > 0) {
        const proximidade = Math.max(0, 1 - minutosDaLuz / 180);
        nota *= 1 - especie.dependeDaLuz * 0.3 * (1 - proximidade);
        if (proximidade > 0.7 && especie.dependeDaLuz > 0.7) razoes.push('na virada de luz');
      }

      if (especie.dependeDaLua > 0) {
        nota *= 1 - especie.dependeDaLua * 0.2 * (1 - Math.max(0, sizigia));
      }

      const arredondada = Math.max(0, Math.min(100, Math.round(nota)));
      return {
        especie,
        nota: arredondada,
        estrelas: Math.max(1, Math.min(5, Math.ceil(arredondada / 20))) as 1 | 2 | 3 | 4 | 5,
        porque: razoes[0] ?? especie.onde,
      };
    })
    .sort((x, y) => y.nota - x.nota);
}
