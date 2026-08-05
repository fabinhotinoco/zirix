/**
 * O vocabulário das condições de pesca.
 *
 * Uma decisão atravessa este arquivo inteiro: **água salgada e água doce são o
 * mesmo domínio com campos diferentes, não dois domínios.** A plataforma tem os
 * dois públicos — costeira e oceânica em Niterói, represa em Minas — e escrever
 * dois modelos separados significaria manter duas cópias da mesma regra de
 * vento, de pressão e de lua.
 *
 * O que muda é o que existe: represa não tem maré, ondulação de mar aberto nem
 * salinidade. Esses campos são `null` em água doce, e a tela some com a seção
 * inteira em vez de mostrar "0,0 m" — que seria mentira com cara de dado.
 */

export type TipoDeAgua = 'salgada' | 'doce';

export interface Local {
  nome: string;
  lat: number;
  lng: number;
  agua: TipoDeAgua;
}

export type TendenciaPressao = 'subindo' | 'estavel' | 'caindo';

/**
 * Uma fotografia das condições num instante.
 *
 * Todo campo é anulável de propósito. Provedor de previsão falha em pedaços:
 * volta o vento e não volta a onda, volta a temperatura do ar e não a da água.
 * Um modelo que exige tudo transforma falta parcial em tela vazia.
 */
export interface Ambiente {
  instante: Date;

  // --- atmosfera ---
  temperaturaC: number | null;
  sensacaoC: number | null;
  umidade: number | null;
  pressaoHpa: number | null;
  tendenciaPressao: TendenciaPressao | null;
  ventoNos: number | null;
  rajadaNos: number | null;
  /** Direção de ONDE o vento vem, em graus. 0 = norte. */
  ventoDirecao: number | null;
  nuvens: number | null;
  uv: number | null;
  visibilidadeKm: number | null;
  chanceChuva: number | null;
  chuvaMm: number | null;
  trovoada: boolean | null;

  // --- água (mar aberto: tudo; represa: só a temperatura) ---
  ondaM: number | null;
  ondaPeriodoS: number | null;
  ondaDirecao: number | null;
  aguaC: number | null;
  correnteNos: number | null;
  correnteDirecao: number | null;
  /** Nível do mar em relação à média, em metros. É daqui que sai a maré. */
  nivelMarM: number | null;
}

export const AMBIENTE_VAZIO: Omit<Ambiente, 'instante'> = {
  temperaturaC: null, sensacaoC: null, umidade: null, pressaoHpa: null,
  tendenciaPressao: null, ventoNos: null, rajadaNos: null, ventoDirecao: null,
  nuvens: null, uv: null, visibilidadeKm: null, chanceChuva: null, chuvaMm: null,
  trovoada: null, ondaM: null, ondaPeriodoS: null, ondaDirecao: null,
  aguaC: null, correnteNos: null, correnteDirecao: null, nivelMarM: null,
};

// -----------------------------------------------------------------------------
// Classificações que a tela mostra em palavras
// -----------------------------------------------------------------------------

export type EstadoDoMar =
  | 'calmo' | 'pouco_agitado' | 'agitado' | 'muito_agitado' | 'grosso';

export const NOME_DO_MAR: Record<EstadoDoMar, string> = {
  calmo: 'Calmo',
  pouco_agitado: 'Pouco agitado',
  agitado: 'Agitado',
  muito_agitado: 'Muito agitado',
  grosso: 'Mar grosso',
};

/**
 * Estado do mar pela altura significativa, na escala Douglas simplificada.
 *
 * As faixas são as que importam para barco de pesca de até 30 pés, não as da
 * escala completa: acima de 2,5 m a conversa deixa de ser sobre pescar.
 */
export function estadoDoMar(ondaM: number): EstadoDoMar {
  if (ondaM < 0.5) return 'calmo';
  if (ondaM < 1.25) return 'pouco_agitado';
  if (ondaM < 2.5) return 'agitado';
  if (ondaM < 4) return 'muito_agitado';
  return 'grosso';
}

/** Rosa dos ventos em português, de 16 rumos. */
const RUMOS = [
  'N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE',
  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
];

export function rumo(graus: number): string {
  const i = Math.round((((graus % 360) + 360) % 360) / 22.5) % 16;
  return RUMOS[i];
}

/** Força Beaufort a partir da velocidade em nós. */
export function beaufort(nos: number): number {
  const limites = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
  for (let i = 0; i < limites.length; i += 1) if (nos < limites[i]) return i;
  return 12;
}

export type Severidade = 'excelente' | 'bom' | 'regular' | 'ruim' | 'perigoso';

/** Faixa de cor a partir de uma nota de 0 a 100. */
export function severidadeDaNota(nota: number): Severidade {
  if (nota >= 80) return 'excelente';
  if (nota >= 60) return 'bom';
  if (nota >= 40) return 'regular';
  if (nota >= 20) return 'ruim';
  return 'perigoso';
}
