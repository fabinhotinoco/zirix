/**
 * Guarda a última previsão de cada ponto.
 *
 * DOIS MOTIVOS, E O SEGUNDO É O QUE MANDA.
 *
 * 1. Custo e cota. Sem cache, cada abertura da tela é uma chamada ao provedor.
 *    Com dez pescadores olhando o mesmo ponto de manhã, são dez chamadas para
 *    um dado que muda de hora em hora.
 *
 * 2. **Offline.** O pescador consulta a tela no barco, no cais, no caminho — e
 *    é exatamente ali que não há sinal. Uma tela que fica em branco sem
 *    internet é uma tela que não serve para o momento em que ela mais importa.
 *    Por isso o dado vencido NÃO é apagado: ele volta marcado como antigo, e a
 *    tela diz de quando é.
 *
 * "Vencido" e "inútil" são coisas diferentes. Previsão de três horas atrás
 * ainda decide a saída; a de três dias atrás, não.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PrevisaoBruta } from './provedor';

const PREFIXO = 'pv.clima.';

/** Quanto tempo cada tipo de dado continua fresco. */
export const VALIDADE_MS = {
  /** Meteorologia muda rápido perto da costa. */
  tempo: 15 * 60 * 1000,
  /** Previsão de dias adiante não muda de 15 em 15 minutos. */
  forecast: 60 * 60 * 1000,
} as const;

/** Depois disso, nem como referência histórica serve. */
const DESCARTE_MS = 48 * 60 * 60 * 1000;

export interface Guardado {
  previsao: PrevisaoBruta;
  /** O dado ainda está dentro da validade? */
  fresco: boolean;
  /** Há quanto tempo foi buscado, em minutos. */
  idadeMinutos: number;
}

/** Uma chave por ponto, arredondada — 3 casas ≈ 100 m, que é o mesmo ponto. */
export function chaveDoLocal(lat: number, lng: number, dias: number): string {
  return `${PREFIXO}${lat.toFixed(3)},${lng.toFixed(3)},${dias}`;
}

interface Envelope {
  buscadoEm: number;
  previsao: unknown;
}

export async function guardar(chave: string, previsao: PrevisaoBruta): Promise<void> {
  try {
    const envelope: Envelope = { buscadoEm: previsao.buscadoEm.getTime(), previsao };
    await AsyncStorage.setItem(chave, JSON.stringify(envelope));
  } catch {
    // Disco cheio ou armazenamento indisponível não pode derrubar a tela: o
    // dado já está em memória e vai ser mostrado do mesmo jeito.
  }
}

export async function ler(chave: string, validadeMs: number): Promise<Guardado | null> {
  try {
    const bruto = await AsyncStorage.getItem(chave);
    if (!bruto) return null;

    const envelope = JSON.parse(bruto) as Envelope;
    const idade = Date.now() - envelope.buscadoEm;
    if (idade > DESCARTE_MS) {
      await AsyncStorage.removeItem(chave);
      return null;
    }

    return {
      previsao: reviver(envelope.previsao as PrevisaoBruta),
      fresco: idade <= validadeMs,
      idadeMinutos: Math.round(idade / 60_000),
    };
  } catch {
    return null;
  }
}

/**
 * JSON não tem data: tudo volta como texto.
 *
 * Sem este passo o aplicativo recebe strings onde espera `Date` e quebra na
 * primeira comparação de horário — sem erro de tipo, porque veio de `JSON.parse`.
 */
function reviver(p: PrevisaoBruta): PrevisaoBruta {
  return {
    ...p,
    buscadoEm: new Date(p.buscadoEm),
    horas: p.horas.map((h) => ({ ...h, instante: new Date(h.instante) })),
    nivelDoMar: p.nivelDoMar.map((n) => ({ ...n, instante: new Date(n.instante) })),
  };
}
