/**
 * Motor de cancelamento: quanto o cliente recebe de volta.
 *
 * A escala de retenção cresce conforme a data se aproxima, mas três
 * salvaguardas a mantêm defensável perante o Código de Defesa do Consumidor —
 * e as três são obrigatórias, não opcionais:
 *
 *   1. A retenção nunca supera o que foi efetivamente pago.
 *   2. Se a data for revendida, o valor retido volta (menos a taxa administrativa).
 *   3. O arrependimento de 7 dias (art. 49 do CDC) prevalece sobre a escala.
 *
 * Ver docs/legal/politica-cancelamento.md.
 */

export interface FaixaRetencao {
  /** Antecedência mínima, em dias, para a faixa valer. */
  diasMin: number;
  /** Antecedência máxima; null = sem teto. */
  diasMax: number | null;
  retencaoPercentual: number;
}

export interface EntradaCancelamento {
  valorLiquidoCentavos: number;
  totalPagoCentavos: number;
  /** Dias corridos entre hoje e a pescaria. Negativo = já passou. */
  diasAteAPescaria: number;
  /** Dias corridos desde que a reserva foi feita. */
  diasDesdeAReserva: number;
  faixas: FaixaRetencao[];
  taxaAdministrativaPercentual: number;
  arrependimentoDias: number;
  /** Cancelamento por guia, clima ou autoridade: devolve tudo, sem retenção. */
  semRetencao?: boolean;
  /** Não comparecimento é tratado como cancelamento na faixa mais severa. */
  noShow?: boolean;
}

export type MotivoRetencao =
  | 'arrependimento'
  | 'sem_retencao'
  | 'no_show'
  | 'faixa';

export interface ResultadoCancelamento {
  retencaoCentavos: number;
  reembolsoCentavos: number;
  motivo: MotivoRetencao;
  faixaAplicada: FaixaRetencao | null;
  /** Quanto voltaria ao cliente se a data for revendida depois. */
  devolucaoSeRevendidaCentavos: number;
}

export function calcularCancelamento(e: EntradaCancelamento): ResultadoCancelamento {
  validarNaoNegativo(e.valorLiquidoCentavos, 'valor líquido');
  validarNaoNegativo(e.totalPagoCentavos, 'total pago');

  if (e.totalPagoCentavos > e.valorLiquidoCentavos) {
    throw new Error('Total pago maior que o valor da reserva.');
  }

  const taxaAdm = Math.round(
    (e.valorLiquidoCentavos * e.taxaAdministrativaPercentual) / 100,
  );

  // 1. Cancelamento sem culpa do cliente: devolve tudo.
  if (e.semRetencao) {
    return montar(0, e.totalPagoCentavos, 'sem_retencao', null, 0);
  }

  // 2. Arrependimento do art. 49 vence a escala — inclusive a taxa
  //    administrativa —, desde que a pescaria ainda não tenha ocorrido.
  const dentroDoArrependimento =
    e.diasDesdeAReserva <= e.arrependimentoDias && e.diasAteAPescaria >= 0;
  if (dentroDoArrependimento) {
    return montar(0, e.totalPagoCentavos, 'arrependimento', null, 0);
  }

  // 3. Escala normal (ou faixa mais severa, no caso de não comparecimento).
  const faixa = e.noShow
    ? faixaMaisSevera(e.faixas)
    : faixaAplicavel(e.faixas, e.diasAteAPescaria);

  const retencaoBruta = Math.round(
    (e.valorLiquidoCentavos * faixa.retencaoPercentual) / 100,
  );

  // Salvaguarda: nunca reter mais do que entrou. Cobrar diferença de quem
  // cancelou é briga cara e de resultado incerto.
  const retencao = Math.min(retencaoBruta, e.totalPagoCentavos);
  const reembolso = e.totalPagoCentavos - retencao;

  // Se a data for revendida, devolve-se o retido menos a taxa administrativa.
  const devolucaoSeRevendida = Math.max(0, retencao - taxaAdm);

  return montar(
    retencao,
    reembolso,
    e.noShow ? 'no_show' : 'faixa',
    faixa,
    devolucaoSeRevendida,
  );
}

/**
 * Segunda devolução, disparada quando a data cancelada é fechada por outro
 * grupo. É o que amarra a retenção ao prejuízo real — sem isso, a escala vira
 * cláusula puramente punitiva, e cláusula punitiva cai.
 */
export function calcularDevolucaoPorRevenda(
  retencaoAplicadaCentavos: number,
  valorLiquidoCentavos: number,
  taxaAdministrativaPercentual: number,
): number {
  const taxaAdm = Math.round(
    (valorLiquidoCentavos * taxaAdministrativaPercentual) / 100,
  );
  return Math.max(0, retencaoAplicadaCentavos - taxaAdm);
}

/**
 * Quanto da comissão volta para a plataforma quando parte de uma cobrança é
 * estornada. O Mercado Pago debita o estorno proporcionalmente das duas
 * contas — PENDENTE DE CONFIRMAÇÃO em sandbox, ver tools/mp-sandbox.
 */
export function comissaoRevertida(
  feeDaCobrancaCentavos: number,
  valorEstornadoCentavos: number,
  valorDaCobrancaCentavos: number,
): number {
  if (valorDaCobrancaCentavos <= 0) return 0;
  if (valorEstornadoCentavos > valorDaCobrancaCentavos) {
    throw new Error('Estorno maior que a cobrança.');
  }
  return Math.round(
    (feeDaCobrancaCentavos * valorEstornadoCentavos) / valorDaCobrancaCentavos,
  );
}

export function faixaAplicavel(
  faixas: FaixaRetencao[],
  diasAteAPescaria: number,
): FaixaRetencao {
  const dias = Math.max(0, diasAteAPescaria);
  const ordenadas = [...faixas].sort((a, b) => b.diasMin - a.diasMin);
  const achada = ordenadas.find(
    (f) => dias >= f.diasMin && (f.diasMax === null || dias <= f.diasMax),
  );
  if (!achada) {
    throw new Error(
      `Nenhuma faixa de retenção cobre ${dias} dias. Revise cancellation_rules.`,
    );
  }
  return achada;
}

function faixaMaisSevera(faixas: FaixaRetencao[]): FaixaRetencao {
  return [...faixas].sort(
    (a, b) => b.retencaoPercentual - a.retencaoPercentual,
  )[0];
}

function montar(
  retencaoCentavos: number,
  reembolsoCentavos: number,
  motivo: MotivoRetencao,
  faixaAplicada: FaixaRetencao | null,
  devolucaoSeRevendidaCentavos: number,
): ResultadoCancelamento {
  return {
    retencaoCentavos,
    reembolsoCentavos,
    motivo,
    faixaAplicada,
    devolucaoSeRevendidaCentavos,
  };
}

function validarNaoNegativo(v: number, nome: string): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`Valor inválido para ${nome}: ${v} (esperado inteiro em centavos)`);
  }
}
