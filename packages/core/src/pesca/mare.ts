/**
 * Maré, extraída da série de nível do mar.
 *
 * POR QUE NÃO UMA API DE MARÉ.
 *
 * As tábuas oficiais brasileiras são da Marinha e saem em PDF por porto, sem
 * API pública. Os serviços que oferecem maré por API são pagos ou pedem chave
 * com cota apertada. E maré errada é pior que maré nenhuma: quem sai no horário
 * errado por causa de um número inventado não volta a confiar no aplicativo.
 *
 * A saída honesta é usar o que já vem de graça no mesmo pedido do resto — o
 * nível do mar previsto hora a hora — e tirar dele as preamares e baixa-mares
 * por análise da própria curva. É o mesmo dado que sustenta a tábua, só que
 * lido por nós.
 *
 * LIMITE, DITO EM VOZ ALTA: a resolução é horária, então o horário do pico sai
 * com erro de alguns minutos e a altura é relativa ao nível médio, não ao zero
 * hidrográfico da carta náutica. Para decidir "a maré vai encher durante o
 * amanhecer" isso basta. Para navegação em baixio, não substitui a tábua.
 *
 * O QUE IMPORTA PARA A PESCA não é a altura, é o MOVIMENTO: peixe come com
 * água correndo. Por isso o campo mais usado daqui é `movimento`, não `altura`.
 */

export type TipoDeMare = 'preamar' | 'baixamar';

export interface EventoDeMare {
  tipo: TipoDeMare;
  instante: Date;
  /** Altura em relação ao nível médio do mar, em metros. */
  alturaM: number;
}

export type Movimento = 'enchendo' | 'vazando' | 'parada';

export interface EstadoDaMare {
  movimento: Movimento;
  /** Altura no instante consultado, em metros sobre o nível médio. */
  alturaM: number;
  /**
   * Quanto a água está correndo, de 0 a 1.
   *
   * 1 é a meia-maré, quando a corrente é mais forte; 0 é a estofa, no topo da
   * preamar ou no fundo da baixa-mar. É este número, e não a altura, que
   * entra no índice de pesca.
   */
  forca: number;
  proximo: EventoDeMare | null;
  anterior: EventoDeMare | null;
}

export interface PontoDeNivel {
  instante: Date;
  nivelM: number;
}

/**
 * Preamares e baixa-mares da série.
 *
 * Acha os extremos comparando cada ponto com os vizinhos e refina o horário com
 * uma parábola pelos três pontos — a resolução horária, sozinha, arredondaria
 * todo pico para a hora cheia, e a tábua ficaria com cara de invenção.
 */
export function eventosDeMare(serie: PontoDeNivel[]): EventoDeMare[] {
  if (serie.length < 3) return [];

  const eventos: EventoDeMare[] = [];
  for (let i = 1; i < serie.length - 1; i += 1) {
    const a = serie[i - 1].nivelM;
    const b = serie[i].nivelM;
    const c = serie[i + 1].nivelM;

    const ehPico = b > a && b >= c;
    const ehVale = b < a && b <= c;
    if (!ehPico && !ehVale) continue;

    // Vértice da parábola que passa pelos três pontos, em passos de amostra.
    const denominador = a - 2 * b + c;
    const desvio = denominador === 0 ? 0 : (0.5 * (a - c)) / denominador;
    const passoMs = serie[i + 1].instante.getTime() - serie[i].instante.getTime();

    eventos.push({
      tipo: ehPico ? 'preamar' : 'baixamar',
      instante: new Date(serie[i].instante.getTime() + desvio * passoMs),
      alturaM: b - 0.25 * (a - c) * desvio,
    });
  }
  return eventos;
}

/**
 * Estado da maré num instante.
 *
 * `forca` é uma senoide entre os dois extremos que cercam o instante: máxima na
 * metade do caminho, nula na estofa. É a forma da corrente de maré, que segue a
 * derivada da altura — e a altura é aproximadamente senoidal.
 */
export function estadoDaMare(
  serie: PontoDeNivel[],
  instante: Date,
  eventos = eventosDeMare(serie),
): EstadoDaMare | null {
  if (serie.length < 3) return null;

  const t = instante.getTime();
  const anterior = [...eventos].reverse().find((e) => e.instante.getTime() <= t) ?? null;
  const proximo = eventos.find((e) => e.instante.getTime() > t) ?? null;

  const alturaM = interpolar(serie, t);
  if (alturaM === null) return null;

  if (!anterior || !proximo) {
    // Nas pontas da série não dá para saber para onde a água vai sem inventar.
    return { movimento: 'parada', alturaM, forca: 0, proximo, anterior };
  }

  const total = proximo.instante.getTime() - anterior.instante.getTime();
  const andado = t - anterior.instante.getTime();
  const fracao = total === 0 ? 0 : andado / total;

  return {
    movimento: proximo.tipo === 'preamar' ? 'enchendo' : 'vazando',
    alturaM,
    forca: Math.sin(fracao * Math.PI),
    proximo,
    anterior,
  };
}

/** Altura no instante, interpolada linearmente entre as amostras vizinhas. */
function interpolar(serie: PontoDeNivel[], t: number): number | null {
  if (t <= serie[0].instante.getTime()) return serie[0].nivelM;
  const ultimo = serie[serie.length - 1];
  if (t >= ultimo.instante.getTime()) return ultimo.nivelM;

  for (let i = 1; i < serie.length; i += 1) {
    const b = serie[i];
    if (b.instante.getTime() < t) continue;
    const a = serie[i - 1];
    const span = b.instante.getTime() - a.instante.getTime();
    const f = span === 0 ? 0 : (t - a.instante.getTime()) / span;
    return a.nivelM + (b.nivelM - a.nivelM) * f;
  }
  return null;
}

/** Amplitude do dia: a maior diferença entre uma preamar e a baixa-mar vizinha. */
export function amplitudeM(eventos: EventoDeMare[]): number | null {
  if (eventos.length < 2) return null;
  let maior = 0;
  for (let i = 1; i < eventos.length; i += 1) {
    maior = Math.max(maior, Math.abs(eventos[i].alturaM - eventos[i - 1].alturaM));
  }
  return maior;
}
