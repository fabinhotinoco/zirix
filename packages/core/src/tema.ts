/**
 * A identidade visual: Abissal, em modo dia e noite.
 *
 * Água funda e sonar — ciano luminoso sobre quase preto. Escolhida entre três
 * propostas; as outras duas saíram do código, porque paleta de marca não é
 * preferência de quem usa. O que a pessoa escolhe é o MODO (dia, noite ou
 * híbrido), e isso continua em `ModoDeTema`.
 *
 * Cor vive aqui, e não espalhada pelas telas, por um motivo prático: a mesma
 * cor precisa existir clara e escura, e afinar a marca não pode virar uma
 * caçada por códigos hexadecimais em vinte arquivos.
 *
 * Toda combinação é conferida por teste de contraste (packages/core/test/
 * tema.test.ts). Cor bonita que ninguém lê é o erro clássico deste projeto —
 * já aconteceu: texto branco sobre cinza claro deu 1,4:1 e o botão virou um
 * retângulo vazio para quem estava usando. Agora o teste barra antes de subir.
 */

export type ModoDeTema = 'dia' | 'noite' | 'hibrido';
export type Aparencia = 'dia' | 'noite';

export interface Cores {
  /** Fundo da tela. */
  fundo: string;
  /** Cartão sobre o fundo. */
  superficie: string;
  /** Campo de entrada e blocos destacados. */
  superficieAlta: string;
  borda: string;
  texto: string;
  textoSuave: string;
  /** Cor da marca: botão principal, links, seleção. */
  acento: string;
  /** O que se escreve EM CIMA do acento. */
  acentoTexto: string;
  /** Fundo tingido para selos e avisos discretos. */
  acentoSuave: string;
  erro: string;
  sucesso: string;
  aviso: string;
}

export interface Paleta {
  titulo: string;
  ideia: string;
  dia: Cores;
  noite: Cores;
}

export const MARCA: Paleta = {
  titulo: 'Abissal',
  ideia: 'Água funda e sonar: ciano luminoso sobre quase preto.',
  noite: {
    fundo: '#060B10',
    superficie: '#0D151C',
    superficieAlta: '#142029',
    borda: '#22323E',
    texto: '#E8F1F5',
    textoSuave: '#9DB2BE',
    acento: '#22E0C8',
    acentoTexto: '#00201C',
    acentoSuave: '#0F3330',
    erro: '#FF8A8A',
    sucesso: '#4FE0A0',
    aviso: '#FFC24B',
  },
  dia: {
    fundo: '#F4F8FA',
    superficie: '#FFFFFF',
    superficieAlta: '#EAF1F4',
    borda: '#C7D6DE',
    texto: '#08131B',
    textoSuave: '#4A5F6B',
    acento: '#00706A',
    acentoTexto: '#FFFFFF',
    acentoSuave: '#DAF2EF',
    erro: '#A81E17',
    sucesso: '#0B6B49',
    aviso: '#7A4F00',
  },
};

/**
 * O modo escolhido vira a aparência de fato.
 *
 * 'hibrido' segue o aparelho: quem deixa o celular escurecer à noite espera que
 * o aplicativo acompanhe, sem ter de vir aqui trocar.
 */
export function resolverAparencia(modo: ModoDeTema, doSistema: Aparencia): Aparencia {
  return modo === 'hibrido' ? doSistema : modo;
}

export function coresDe(aparencia: Aparencia): Cores {
  return aparencia === 'noite' ? MARCA.noite : MARCA.dia;
}

// -----------------------------------------------------------------------------
// Contraste (WCAG 2.1)
// -----------------------------------------------------------------------------

function canal(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de um hexadecimal #RRGGBB. */
export function luminancia(hex: string): number {
  const limpo = hex.replace('#', '');
  const n = parseInt(limpo, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste entre duas cores: 1 (invisível) a 21 (preto no branco). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}
