/**
 * A fronteira entre o aplicativo e quem publica previsão.
 *
 * POR QUE UMA CAMADA, E NÃO `fetch` DIRETO NA TELA.
 *
 * Provedor de meteorologia é a peça mais provável de trocar neste projeto: o
 * gratuito muda de licença, o pago fica caro, o que cobre o mar não cobre a
 * represa. Se a tela souber o formato do provedor, trocar significa reescrever
 * a tela — e no dia da troca ninguém lembra por que cada campo estava ali.
 *
 * Aqui o contrato é o domínio (`Ambiente`, em `@pescavertical/core`), não o
 * JSON de ninguém. Cada provedor traduz o dele para isso.
 *
 * SOBRE UNIDADES: tudo entra convertido — vento em NÓS (não km/h), onda em
 * METROS, pressão em hPa. Unidade que varia por provedor é a origem clássica de
 * um erro que ninguém vê: 30 km/h vira "30 nós" e o aplicativo manda o pescador
 * ficar em casa num dia de brisa.
 */

import type { Ambiente, Local } from '@pescavertical/core/pesca/tipos';
import type { PontoDeNivel } from '@pescavertical/core/pesca/mare';

export interface PrevisaoBruta {
  /** Série horária cobrindo os dias pedidos. */
  horas: Ambiente[];
  /** Nível do mar hora a hora. Vazio em água doce ou fora da cobertura. */
  nivelDoMar: PontoDeNivel[];
  /** Quando estes dados foram buscados. */
  buscadoEm: Date;
  /** Nome do provedor, para a tela creditar a fonte. */
  fonte: string;
  /**
   * O ponto tem cobertura de dados marinhos?
   *
   * É assim que a plataforma descobre sozinha se um ponto é mar ou água
   * interior, sem precisar que alguém marque isso no cadastro — e sem errar
   * quando um guia novo entrar num lugar que ninguém previu.
   */
  temDadosDeMar: boolean;
}

export interface ProvedorDeClima {
  nome: string;
  /** Busca `dias` dias a partir de hoje. */
  buscar(local: Pick<Local, 'lat' | 'lng'>, dias: number): Promise<PrevisaoBruta>;
}

/** Km/h para nós. */
export const emNos = (kmh: number | null | undefined): number | null =>
  kmh === null || kmh === undefined || Number.isNaN(kmh) ? null : kmh / 1.852;

/** Número que pode não ter vindo, sem virar NaN nem zero. */
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
