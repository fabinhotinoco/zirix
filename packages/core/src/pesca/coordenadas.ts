/**
 * Ler coordenada do jeito que uma pessoa realmente entrega.
 *
 * O guia não vai digitar latitude e longitude em dois campos separados. Ele vai
 * abrir o Google Maps, segurar o dedo no ponto onde larga o barco e **colar** o
 * que aparecer. O que aparece varia: às vezes `-22.9265, -43.1176`, às vezes o
 * endereço inteiro do mapa, às vezes graus e minutos.
 *
 * Pedir que ele converta é transferir para ele um trabalho que o programa faz
 * melhor — e é assim que se ganha um cadastro vazio, que na tela de condições
 * vira "nenhuma operação tem o ponto cadastrado".
 *
 * A VÍRGULA É O PONTO DELICADO. Em português a vírgula é decimal, e também é o
 * que separa as duas coordenadas. `-22,9265, -43,1176` tem três vírgulas e
 * significados diferentes para cada uma. A contagem resolve sem ambiguidade.
 */

export interface Coordenada {
  lat: number;
  lng: number;
}

const dentroDaFaixa = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Graus, minutos e segundos → grau decimal. */
function deDMS(texto: string): Coordenada | null {
  const padrao = /(\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″]\s*)?([NSLOEWnslowe])/g;
  const achados = [...texto.matchAll(padrao)];
  if (achados.length < 2) return null;

  const valores = achados.slice(0, 2).map((m) => {
    const g = Number(m[1].replace(',', '.'));
    const min = m[2] ? Number(m[2].replace(',', '.')) : 0;
    const seg = m[3] ? Number(m[3].replace(',', '.')) : 0;
    const rumo = m[4].toUpperCase();
    const decimal = g + min / 60 + seg / 3600;
    // S e O (oeste) são negativos. 'W' vem de mapa em inglês; 'L' é leste, e
    // 'E' também — não confundir 'E' com 'Este' negativo.
    return { valor: rumo === 'S' || rumo === 'O' || rumo === 'W' ? -decimal : decimal, rumo };
  });

  const lat = valores.find((v) => v.rumo === 'N' || v.rumo === 'S');
  const lng = valores.find((v) => ['L', 'O', 'E', 'W'].includes(v.rumo));
  if (!lat || !lng) return null;
  return dentroDaFaixa(lat.valor, lng.valor) ? { lat: lat.valor, lng: lng.valor } : null;
}

/** Separa um texto em dois números, resolvendo a ambiguidade da vírgula. */
function doisNumeros(bruto: string): [string, string] | null {
  const texto = bruto.trim();
  const virgulas = (texto.match(/,/g) ?? []).length;

  // "-22,9265; -43,1176" ou "-22,9265 -43,1176": vírgula é sempre decimal.
  if (/[;/]/.test(texto)) {
    const partes = texto.split(/[;/]/).map((p) => p.trim().replace(',', '.'));
    return partes.length === 2 ? [partes[0], partes[1]] : null;
  }

  // "-22,9265, -43,1176": a vírgula do MEIO separa; as outras são decimais.
  if (virgulas === 3) {
    const i = texto.indexOf(',', texto.indexOf(',') + 1);
    return [
      texto.slice(0, i).trim().replace(',', '.'),
      texto.slice(i + 1).trim().replace(',', '.'),
    ];
  }

  // "-22.9265, -43.1176": a única vírgula separa.
  if (virgulas === 1) {
    const partes = texto.split(',').map((p) => p.trim());
    return partes.length === 2 ? [partes[0], partes[1]] : null;
  }

  // "-22.9265 -43.1176": separado por espaço.
  if (virgulas === 0) {
    const partes = texto.split(/\s+/).filter(Boolean);
    return partes.length === 2 ? [partes[0], partes[1]] : null;
  }

  return null;
}

/**
 * Coordenada a partir de qualquer coisa que o guia colar.
 *
 * Devolve `null` quando não dá para ler com segurança. Chutar aqui seria pior
 * que recusar: previsão do lugar errado é pior que previsão nenhuma, e ninguém
 * confere uma coordenada depois de salva.
 */
export function lerCoordenada(bruto: string): Coordenada | null {
  const texto = (bruto ?? '').trim();
  if (texto === '') return null;

  // Link do Google Maps. A ORDEM IMPORTA: um mesmo link pode trazer dois pares
  // diferentes. O que vem depois de `@` é onde a CÂMERA estava — o centro da
  // tela, que raramente é o ponto. O de `!3d…!4d…` é o marcador de verdade, e
  // por isso vem primeiro.
  const paresDeLink: RegExp[] = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const padrao of paresDeLink) {
    const achado = texto.match(padrao);
    if (!achado) continue;
    const lat = Number(achado[1]);
    const lng = Number(achado[2]);
    if (dentroDaFaixa(lat, lng)) return { lat, lng };
  }

  const dms = deDMS(texto);
  if (dms) return dms;

  const partes = doisNumeros(texto);
  if (!partes) return null;

  const lat = Number(partes[0]);
  const lng = Number(partes[1]);
  return dentroDaFaixa(lat, lng) ? { lat, lng } : null;
}

/** Como a coordenada é mostrada de volta para conferência. */
export function escreverCoordenada(c: Coordenada): string {
  return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
}

/**
 * A coordenada cai no Brasil?
 *
 * Não recusa nada — é aviso, não trava. Serve para pegar o engano mais comum,
 * que é colar o par invertido: `-43, -22` põe o ponto no meio do Atlântico Sul,
 * e a previsão sai bonita e completamente errada.
 */
export function pareceForaDoBrasil(c: Coordenada): boolean {
  const dentro = c.lat >= -34 && c.lat <= 6 && c.lng >= -74 && c.lng <= -34;
  return !dentro;
}
