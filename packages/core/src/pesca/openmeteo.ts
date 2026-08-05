/**
 * Traduzir a resposta do Open-Meteo para o domínio.
 *
 * POR QUE ISTO MORA NO NÚCLEO, E NÃO NO APLICATIVO.
 *
 * Esta é a parte com mais armadilha de todo o caminho da previsão — unidade
 * trocada, cobertura marinha inexistente, série faltando pedaços — e é a única
 * que dá para testar sem rede. Aqui ela roda no `node --test` junto com o
 * resto; dentro do aplicativo, só rodaria abrindo a tela.
 *
 * E há uma segunda razão: o mesmo JSON precisa ser traduzido em DOIS lugares —
 * no aplicativo e na função do servidor que guarda o cache. Uma cópia em cada
 * um seria duas traduções para divergir.
 */

import type { Ambiente } from './tipos.ts';
import type { PontoDeNivel } from './mare.ts';

export interface RespostaOpenMeteo {
  hourly?: Record<string, unknown>;
}

export interface Traduzido {
  horas: Ambiente[];
  nivelDoMar: PontoDeNivel[];
  /**
   * O ponto tem cobertura de dados marinhos?
   *
   * É assim que a plataforma descobre sozinha se um ponto é mar ou água
   * interior, sem pedir que o guia classifique — e sem errar quando ele
   * classificar mal.
   */
  temDadosDeMar: boolean;
}

/** Códigos WMO de trovoada. */
const TROVOADA = new Set([95, 96, 99]);

const coluna = (s: Record<string, unknown> | undefined, nome: string): Array<number | null> =>
  Array.isArray(s?.[nome]) ? (s[nome] as Array<number | null>) : [];

/** Número que pode não ter vindo, sem virar NaN nem zero. */
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Km/h para nós. */
export const emNos = (kmh: number | null): number | null =>
  kmh === null ? null : kmh / 1.852;

/**
 * Tendência da pressão comparando com três horas atrás.
 *
 * Três horas é o intervalo que a meteorologia náutica usa. Uma hora oscila
 * demais e classificaria como "caindo" um ruído de 0,2 hPa; seis horas atrasam
 * a leitura da frente que está chegando.
 */
export function tendencia(
  serie: Array<number | null>,
  i: number,
): Ambiente['tendenciaPressao'] {
  const agora = num(serie[i]);
  const antes = num(serie[i - 3]);
  if (agora === null || antes === null) return null;
  const delta = agora - antes;
  if (delta > 1) return 'subindo';
  if (delta < -1) return 'caindo';
  return 'estavel';
}

/**
 * Junta as duas respostas do Open-Meteo numa série de ambientes.
 *
 * `mar` pode ser nulo: ponto de água interior, ou o serviço marinho fora do ar.
 * Nos dois casos o resto do dia continua funcionando.
 */
export function traduzirOpenMeteo(
  tempo: RespostaOpenMeteo | null,
  mar: RespostaOpenMeteo | null,
): Traduzido {
  const h = tempo?.hourly;
  const instantes = (Array.isArray(h?.time) ? (h.time as string[]) : []).map((t) => new Date(t));

  const temperatura = coluna(h, 'temperature_2m');
  const sensacao = coluna(h, 'apparent_temperature');
  const umidade = coluna(h, 'relative_humidity_2m');
  // `pressure_msl` é a pressão reduzida ao nível do mar — a que se compara
  // entre lugares e a que as regras de pesca usam. `surface_pressure` varia com
  // a altitude e diria "pressão baixa" numa represa de montanha.
  const pressao = coluna(h, 'pressure_msl');
  const vento = coluna(h, 'wind_speed_10m'); // já em nós, por wind_speed_unit=kn
  const rajada = coluna(h, 'wind_gusts_10m');
  const direcao = coluna(h, 'wind_direction_10m');
  const nuvens = coluna(h, 'cloud_cover');
  const uv = coluna(h, 'uv_index');
  const visibilidade = coluna(h, 'visibility');
  const chance = coluna(h, 'precipitation_probability');
  const chuva = coluna(h, 'precipitation');
  const codigo = coluna(h, 'weather_code');

  const m = mar?.hourly;
  const instantesMar = (Array.isArray(m?.time) ? (m.time as string[]) : []).map((t) =>
    new Date(t).getTime(),
  );
  const onda = coluna(m, 'wave_height');
  const periodo = coluna(m, 'wave_period');
  const direcaoOnda = coluna(m, 'wave_direction');
  const aguaC = coluna(m, 'sea_surface_temperature');
  const nivel = coluna(m, 'sea_level_height_msl');
  const corrente = coluna(m, 'ocean_current_velocity');
  const direcaoCorrente = coluna(m, 'ocean_current_direction');

  // Cobertura marinha de verdade é ter ALTURA DE ONDA, não a resposta 200. O
  // serviço responde para qualquer coordenada; num ponto de água interior ele
  // devolve a série inteira de nulos.
  const temDadosDeMar = onda.some((v) => num(v) !== null);

  const porInstante = new Map<number, number>();
  instantesMar.forEach((t, i) => porInstante.set(t, i));

  const horas: Ambiente[] = instantes.map((instante, i) => {
    const j = porInstante.get(instante.getTime());
    const temMar = temDadosDeMar && j !== undefined;
    const wmo = num(codigo[i]);
    const vis = num(visibilidade[i]);

    return {
      instante,
      temperaturaC: num(temperatura[i]),
      sensacaoC: num(sensacao[i]),
      umidade: num(umidade[i]),
      pressaoHpa: num(pressao[i]),
      tendenciaPressao: tendencia(pressao, i),
      ventoNos: num(vento[i]),
      rajadaNos: num(rajada[i]),
      ventoDirecao: num(direcao[i]),
      nuvens: num(nuvens[i]),
      uv: num(uv[i]),
      // O serviço devolve metros; a tela fala em quilômetros.
      visibilidadeKm: vis === null ? null : vis / 1000,
      chanceChuva: num(chance[i]),
      chuvaMm: num(chuva[i]),
      trovoada: wmo === null ? null : TROVOADA.has(wmo),
      ondaM: temMar ? num(onda[j]) : null,
      ondaPeriodoS: temMar ? num(periodo[j]) : null,
      ondaDirecao: temMar ? num(direcaoOnda[j]) : null,
      aguaC: temMar ? num(aguaC[j]) : null,
      correnteNos: temMar ? emNos(num(corrente[j])) : null,
      correnteDirecao: temMar ? num(direcaoCorrente[j]) : null,
      nivelMarM: temMar ? num(nivel[j]) : null,
    };
  });

  const nivelDoMar: PontoDeNivel[] = temDadosDeMar
    ? instantesMar
        .map((t, i) => ({ instante: new Date(t), nivelM: num(nivel[i]) }))
        .filter((p): p is PontoDeNivel => p.nivelM !== null)
    : [];

  return { horas, nivelDoMar, temDadosDeMar };
}
