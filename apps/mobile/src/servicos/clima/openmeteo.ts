/**
 * Open-Meteo: previsão do tempo e do mar, sem chave.
 *
 * POR QUE ESTE PROVEDOR.
 *
 * É o único gratuito que cobre, no mesmo lugar e sem cadastro, as três coisas
 * de que a tela precisa: meteorologia, ondulação/corrente/temperatura da água,
 * e — o mais difícil de achar de graça — o **nível do mar hora a hora**, que é
 * de onde tiramos a maré. Os concorrentes ou não têm maré, ou dão 10 chamadas
 * por dia, ou cobram.
 *
 * ⚠️ LICENÇA. O uso sem chave é liberado para uso NÃO COMERCIAL. A plataforma
 * cobra comissão, então é uso comercial: antes de abrir para clientes de
 * verdade é preciso assinar o plano comercial (US$ 29/mês na faixa inicial) ou
 * hospedar a própria instância — o Open-Meteo é código aberto. Está registrado
 * em docs/PLANEJAMENTO.md como decisão pendente, e não é detalhe: é a diferença
 * entre estar em conformidade e não estar.
 *
 * DUAS CHAMADAS, NÃO UMA. A previsão atmosférica e a marinha são serviços
 * separados (`api` e `marine-api`). Vão em paralelo, e a marinha pode falhar
 * sozinha sem derrubar o resto — ponto de água doce simplesmente não tem dados
 * de mar, e isso não é erro.
 */

import type { Ambiente, Local } from '@pescavertical/core/pesca/tipos';
import type { PontoDeNivel } from '@pescavertical/core/pesca/mare';

import { emNos, num, type PrevisaoBruta, type ProvedorDeClima } from './provedor';

const TEMPO = 'https://api.open-meteo.com/v1/forecast';
const MAR = 'https://marine-api.open-meteo.com/v1/marine';

const CAMPOS_HORA = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'surface_pressure', 'pressure_msl', 'wind_speed_10m', 'wind_gusts_10m',
  'wind_direction_10m', 'cloud_cover', 'uv_index', 'visibility',
  'precipitation_probability', 'precipitation', 'weather_code',
].join(',');

const CAMPOS_MAR = [
  'wave_height', 'wave_period', 'wave_direction',
  'sea_surface_temperature', 'sea_level_height_msl',
  'ocean_current_velocity', 'ocean_current_direction',
].join(',');

/** Códigos WMO de trovoada. */
const TROVOADA = new Set([95, 96, 99]);

interface Serie {
  time?: string[];
  [chave: string]: unknown;
}

const coluna = (s: Serie | undefined, nome: string): Array<number | null> =>
  Array.isArray(s?.[nome]) ? (s[nome] as Array<number | null>) : [];

async function pegar(url: string, sinal?: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { signal: sinal });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    // Rede caída, ponto sem cobertura, serviço fora do ar. Quem chama decide o
    // que fazer com a falta; aqui não se inventa dado.
    return null;
  }
}

/**
 * Tendência da pressão comparando com três horas atrás.
 *
 * Três horas é o intervalo que a meteorologia náutica usa. Uma hora oscila
 * demais e classificaria como "caindo" um ruído de 0,2 hPa; seis horas atrasam
 * a leitura da frente que está chegando.
 */
function tendencia(serie: Array<number | null>, i: number): Ambiente['tendenciaPressao'] {
  const agora = serie[i];
  const antes = serie[i - 3];
  if (agora === null || agora === undefined || antes === null || antes === undefined) return null;
  const delta = agora - antes;
  if (delta > 1) return 'subindo';
  if (delta < -1) return 'caindo';
  return 'estavel';
}

export const openMeteo: ProvedorDeClima = {
  nome: 'Open-Meteo',

  async buscar(local: Pick<Local, 'lat' | 'lng'>, dias: number): Promise<PrevisaoBruta> {
    const comum = `latitude=${local.lat.toFixed(4)}&longitude=${local.lng.toFixed(4)}`
      + `&forecast_days=${dias}&timezone=auto`;

    const [tempo, mar] = await Promise.all([
      pegar(`${TEMPO}?${comum}&hourly=${CAMPOS_HORA}&wind_speed_unit=kn`),
      pegar(`${MAR}?${comum}&hourly=${CAMPOS_MAR}`),
    ]);

    if (!tempo) throw new Error('Não consegui buscar a previsão do tempo agora.');

    const h = tempo.hourly as Serie | undefined;
    const instantes = (h?.time ?? []).map((t) => new Date(t));

    const temperatura = coluna(h, 'temperature_2m');
    const sensacao = coluna(h, 'apparent_temperature');
    const umidade = coluna(h, 'relative_humidity_2m');
    // `pressure_msl` é a pressão reduzida ao nível do mar — a que se compara
    // entre lugares e a que as regras de pesca usam. `surface_pressure` varia
    // com a altitude do ponto e diria "pressão baixa" numa represa de montanha.
    const pressao = coluna(h, 'pressure_msl');
    const vento = coluna(h, 'wind_speed_10m'); // já em nós, pelo wind_speed_unit
    const rajada = coluna(h, 'wind_gusts_10m');
    const direcao = coluna(h, 'wind_direction_10m');
    const nuvens = coluna(h, 'cloud_cover');
    const uv = coluna(h, 'uv_index');
    const visibilidade = coluna(h, 'visibility');
    const chance = coluna(h, 'precipitation_probability');
    const chuva = coluna(h, 'precipitation');
    const codigo = coluna(h, 'weather_code');

    const m = mar?.hourly as Serie | undefined;
    const instantesMar = (m?.time ?? []).map((t) => new Date(t).getTime());
    const onda = coluna(m, 'wave_height');
    const periodo = coluna(m, 'wave_period');
    const direcaoOnda = coluna(m, 'wave_direction');
    const aguaC = coluna(m, 'sea_surface_temperature');
    const nivel = coluna(m, 'sea_level_height_msl');
    const corrente = coluna(m, 'ocean_current_velocity');
    const direcaoCorrente = coluna(m, 'ocean_current_direction');

    // Cobertura marinha de verdade é ter ALTURA DE ONDA, não a resposta 200. O
    // serviço responde para qualquer coordenada; num ponto de água interior ele
    // devolve a série cheia de nulos.
    const temDadosDeMar = onda.some((v) => num(v) !== null);

    /** Índice da hora marinha correspondente a um instante atmosférico. */
    const noMar = (t: Date): number => instantesMar.indexOf(t.getTime());

    const horas: Ambiente[] = instantes.map((instante, i) => {
      const j = noMar(instante);
      const temMar = temDadosDeMar && j >= 0;
      const wmo = num(codigo[i]);

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
        visibilidadeKm: (() => {
          const v = num(visibilidade[i]);
          return v === null ? null : v / 1000;
        })(),
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

    return { horas, nivelDoMar, buscadoEm: new Date(), fonte: 'Open-Meteo', temDadosDeMar };
  },
};
