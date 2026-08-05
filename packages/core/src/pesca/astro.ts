/**
 * Sol e lua, calculados aqui — sem API, sem chave, sem internet.
 *
 * POR QUE NÃO PEDIR ISSO A UM SERVIÇO:
 *
 * Nascer do sol e fase da lua são astronomia, não previsão. O resultado é o
 * mesmo hoje, amanhã e daqui a dez anos, e não depende de ninguém publicar
 * nada. Buscar isso na rede significaria: uma chave a mais para vencer, uma
 * cota a mais para estourar, e uma tela que fica em branco quando o pescador
 * está sem sinal — que é exatamente onde ele está, dentro do barco.
 *
 * Calculado aqui, funciona offline e é instantâneo.
 *
 * PRECISÃO. Os algoritmos são os de Jean Meeus (*Astronomical Algorithms*), na
 * forma reduzida. O erro fica em torno de um minuto para o sol e de alguns
 * minutos para a lua, em latitudes brasileiras. Para decidir a hora de sair
 * para pescar isso é folgado: ninguém larga o cais com precisão de segundo.
 *
 * Tudo trabalha em UTC por dentro. Quem formata decide o fuso.
 */

const GRAU = Math.PI / 180;
const DIA_MS = 86_400_000;

/** Dias julianos desde J2000.0 (1º de janeiro de 2000, meio-dia UT). */
function diasDesdeJ2000(data: Date): number {
  return data.getTime() / DIA_MS - 10_957.5;
}

function deJ2000(dias: number): Date {
  return new Date((dias + 10_957.5) * DIA_MS);
}

/** Meia-noite UTC do dia de uma data. */
function meiaNoiteUTC(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

// -----------------------------------------------------------------------------
// Posição do Sol
// -----------------------------------------------------------------------------

interface Equatorial {
  /** Ascensão reta, em radianos. */
  ar: number;
  /** Declinação, em radianos. */
  dec: number;
}

const OBLIQUIDADE = 23.4397 * GRAU;

function declinacao(lambda: number, beta: number): number {
  return Math.asin(
    Math.sin(beta) * Math.cos(OBLIQUIDADE) +
      Math.cos(beta) * Math.sin(OBLIQUIDADE) * Math.sin(lambda),
  );
}

function ascensaoReta(lambda: number, beta: number): number {
  return Math.atan2(
    Math.sin(lambda) * Math.cos(OBLIQUIDADE) - Math.tan(beta) * Math.sin(OBLIQUIDADE),
    Math.cos(lambda),
  );
}

function anomaliaMediaSolar(d: number): number {
  return (357.5291 + 0.98560028 * d) * GRAU;
}

/** Longitude eclíptica do Sol. */
function longitudeSolar(M: number): number {
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * GRAU;
  const P = 102.9372 * GRAU; // perihélio da Terra
  return M + C + P + Math.PI;
}

function posicaoSolar(d: number): Equatorial {
  const M = anomaliaMediaSolar(d);
  const L = longitudeSolar(M);
  return { ar: ascensaoReta(L, 0), dec: declinacao(L, 0) };
}

// -----------------------------------------------------------------------------
// Nascer, pôr e as horas de luz que interessam a quem pesca
// -----------------------------------------------------------------------------

function tempoSideralMedio(d: number, lw: number): number {
  return (280.16 + 360.9856235 * d) * GRAU - lw;
}

function altitude(H: number, lat: number, dec: number): number {
  return Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H),
  );
}

const J0 = 0.0009;

function transitoSolar(ds: number, M: number, L: number): number {
  return J0 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function anguloHorario(h: number, lat: number, dec: number): number {
  const cosH =
    (Math.sin(h) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  // Fora de [-1,1] o sol não cruza aquela altura naquele dia: sol da meia-noite
  // ou noite polar. Não acontece no Brasil, mas devolver NaN em silêncio faria
  // a tela mostrar "Invalid Date".
  if (cosH > 1 || cosH < -1) return NaN;
  return Math.acos(cosH);
}

export interface Sol {
  /** Nulo quando o sol não nasce nem se põe naquele dia (latitudes polares). */
  nascer: Date | null;
  por: Date | null;
  meioDia: Date;
  /**
   * Hora dourada: luz baixa e quente, sombra longa. Vai do nascer até o sol a
   * 6° acima do horizonte, e de volta no fim da tarde. É a janela em que peixe
   * de superfície sobe — e a que todo pescador chama de "o horário".
   */
  douradaManha: [Date, Date] | null;
  douradaTarde: [Date, Date] | null;
  /** Hora azul: sol entre 4° e 6° abaixo do horizonte. Antes e depois da dourada. */
  azulManha: [Date, Date] | null;
  azulTarde: [Date, Date] | null;
  /** Duração do dia claro, em minutos. */
  duracaoMinutos: number;
}

/** Instante em que o sol cruza a altura `h` (radianos), subindo e descendo. */
function cruzamentos(
  h: number,
  data: Date,
  lat: number,
  lng: number,
): [Date, Date] | null {
  const lw = -lng * GRAU;
  const phi = lat * GRAU;
  const d = diasDesdeJ2000(meiaNoiteUTC(data)) + 0.5;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + (lw / (2 * Math.PI)) + n;
  const M = anomaliaMediaSolar(ds);
  const L = longitudeSolar(M);
  const dec = declinacao(L, 0);
  const jnoon = transitoSolar(ds, M, L);

  const w = anguloHorario(h, phi, dec);
  if (Number.isNaN(w)) return null;

  const jset = transitoSolar(ds + w / (2 * Math.PI), M, L);
  const jrise = jnoon - (jset - jnoon);
  return [deJ2000(jrise), deJ2000(jset)];
}

/**
 * Sol do dia, no ponto dado.
 *
 * `data` é usada só para escolher o dia; a hora dela não importa.
 */
export function solDoDia(data: Date, lat: number, lng: number): Sol {
  const lw = -lng * GRAU;
  const d = diasDesdeJ2000(meiaNoiteUTC(data)) + 0.5;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = anomaliaMediaSolar(ds);
  const L = longitudeSolar(M);
  const meioDia = deJ2000(transitoSolar(ds, M, L));

  // -0.833° é o padrão: metade do disco solar mais a refração da atmosfera.
  const horizonte = cruzamentos(-0.833 * GRAU, data, lat, lng);
  const seisAcima = cruzamentos(6 * GRAU, data, lat, lng);
  const quatroAbaixo = cruzamentos(-4 * GRAU, data, lat, lng);
  const seisAbaixo = cruzamentos(-6 * GRAU, data, lat, lng);

  const nascer = horizonte?.[0] ?? null;
  const por = horizonte?.[1] ?? null;

  return {
    nascer,
    por,
    meioDia,
    douradaManha: nascer && seisAcima ? [nascer, seisAcima[0]] : null,
    douradaTarde: por && seisAcima ? [seisAcima[1], por] : null,
    azulManha: quatroAbaixo && seisAbaixo ? [seisAbaixo[0], quatroAbaixo[0]] : null,
    azulTarde: quatroAbaixo && seisAbaixo ? [quatroAbaixo[1], seisAbaixo[1]] : null,
    duracaoMinutos:
      nascer && por ? Math.round((por.getTime() - nascer.getTime()) / 60_000) : 0,
  };
}

// -----------------------------------------------------------------------------
// Lua
// -----------------------------------------------------------------------------

function posicaoLunar(d: number): Equatorial & { distancia: number } {
  const L = (218.316 + 13.176396 * d) * GRAU; // longitude eclíptica média
  const M = (134.963 + 13.064993 * d) * GRAU; // anomalia média
  const F = (93.272 + 13.229350 * d) * GRAU; // distância média do nodo

  const lambda = L + 6.289 * GRAU * Math.sin(M);
  const beta = 5.128 * GRAU * Math.sin(F);
  const distancia = 385_001 - 20_905 * Math.cos(M);

  return { ar: ascensaoReta(lambda, beta), dec: declinacao(lambda, beta), distancia };
}

export type FaseLua =
  | 'nova'
  | 'crescente_concava'
  | 'quarto_crescente'
  | 'crescente_gibosa'
  | 'cheia'
  | 'minguante_gibosa'
  | 'quarto_minguante'
  | 'minguante_concava';

export const NOME_DA_FASE: Record<FaseLua, string> = {
  nova: 'Lua nova',
  crescente_concava: 'Crescente côncava',
  quarto_crescente: 'Quarto crescente',
  crescente_gibosa: 'Crescente gibosa',
  cheia: 'Lua cheia',
  minguante_gibosa: 'Minguante gibosa',
  quarto_minguante: 'Quarto minguante',
  minguante_concava: 'Minguante côncava',
};

export interface Lua {
  /** 0 = nova, 0,25 = quarto crescente, 0,5 = cheia, 0,75 = quarto minguante. */
  fracao: number;
  fase: FaseLua;
  /** Quanto do disco está iluminado, de 0 a 1. */
  iluminacao: number;
  /** Dias desde a última lua nova. */
  idadeDias: number;
  nascer: Date | null;
  ocaso: Date | null;
}

const MES_SINODICO = 29.530588853;

/**
 * Lua do dia.
 *
 * A iluminação vem do ângulo de fase de verdade (Sol–Terra–Lua), não de uma
 * regra de três sobre a idade: perto dos quartos a diferença entre os dois
 * passa de cinco pontos percentuais, e é justamente aí que o pescador decide.
 */
export function luaDoDia(data: Date, lat: number, lng: number): Lua {
  const d = diasDesdeJ2000(data);
  const s = posicaoSolar(d);
  const m = posicaoLunar(d);

  // Elongação geocêntrica entre Sol e Lua.
  const distSol = 149_598_000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ar - m.ar),
  );
  const inc = Math.atan2(distSol * Math.sin(phi), m.distancia - distSol * Math.cos(phi));
  const angulo = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ar - m.ar),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ar - m.ar),
  );

  const fracao = 0.5 + (0.5 * inc * (angulo < 0 ? -1 : 1)) / Math.PI;
  const iluminacao = (1 + Math.cos(inc)) / 2;

  return {
    fracao,
    fase: faseDaFracao(fracao),
    iluminacao,
    idadeDias: fracao * MES_SINODICO,
    ...nascerEOcasoDaLua(data, lat, lng),
  };
}

function faseDaFracao(f: number): FaseLua {
  // Os quartos e as sizígias são pontos, não faixas — mas uma tela precisa
  // dizer alguma coisa nas horas em volta deles. As faixas de ±1,5% da órbita
  // (cerca de 10 horas) mantêm "cheia" significando cheia.
  if (f < 0.015 || f >= 0.985) return 'nova';
  if (f < 0.235) return 'crescente_concava';
  if (f < 0.265) return 'quarto_crescente';
  if (f < 0.485) return 'crescente_gibosa';
  if (f < 0.515) return 'cheia';
  if (f < 0.735) return 'minguante_gibosa';
  if (f < 0.765) return 'quarto_minguante';
  return 'minguante_concava';
}

function alturaLunar(data: Date, lat: number, lng: number): number {
  const d = diasDesdeJ2000(data);
  const m = posicaoLunar(d);
  const H = tempoSideralMedio(d, -lng * GRAU) - m.ar;
  return altitude(H, lat * GRAU, m.dec);
}

/**
 * Nascer e ocaso da lua, por varredura.
 *
 * Vale mais que a fórmula fechada aqui: a lua atrasa cerca de 50 minutos por
 * dia, e há dias em que ela simplesmente não nasce ou não se põe dentro das 24
 * horas. A varredura devolve `null` nesses casos em vez de inventar um horário.
 */
function nascerEOcasoDaLua(
  data: Date,
  lat: number,
  lng: number,
): { nascer: Date | null; ocaso: Date | null } {
  const inicio = meiaNoiteUTC(data).getTime();
  let nascer: Date | null = null;
  let ocaso: Date | null = null;

  let anterior = alturaLunar(new Date(inicio), lat, lng);
  for (let minuto = 10; minuto <= 1440; minuto += 10) {
    const agora = new Date(inicio + minuto * 60_000);
    const h = alturaLunar(agora, lat, lng);
    if (anterior < 0 && h >= 0 && !nascer) nascer = refinar(inicio, minuto, lat, lng, true);
    if (anterior >= 0 && h < 0 && !ocaso) ocaso = refinar(inicio, minuto, lat, lng, false);
    anterior = h;
  }
  return { nascer, ocaso };
}

/** Afina o cruzamento dentro da janela de 10 minutos, ao minuto. */
function refinar(
  inicio: number,
  minutoFim: number,
  lat: number,
  lng: number,
  subindo: boolean,
): Date {
  for (let m = minutoFim - 10; m <= minutoFim; m += 1) {
    const t = new Date(inicio + m * 60_000);
    const h = alturaLunar(t, lat, lng);
    if (subindo ? h >= 0 : h < 0) return t;
  }
  return new Date(inicio + minutoFim * 60_000);
}
