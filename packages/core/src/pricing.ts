/**
 * Cálculo de preço, comissão e parcelas de uma reserva.
 *
 * Tudo aqui trabalha em centavos inteiros. Nenhum valor monetário passa por
 * ponto flutuante em nenhum momento — é o que evita a classe de bug em que
 * um centavo some e o extrato deixa de fechar.
 *
 * Este módulo é a fonte única do cálculo: as Edge Functions o usam no servidor,
 * e o aplicativo apenas exibe o que o servidor devolveu. O preço enviado pelo
 * app nunca é aceito.
 */

export interface OrigensComissao {
  /** Negociação pontual de uma reserva. */
  reservaOverride?: number | null;
  /** Acordo específico daquele barco. */
  barco?: number | null;
  /** Acordo com aquele guia. */
  guia?: number | null;
  /** Padrão da plataforma. Sempre presente. */
  padrao: number;
}

export type OrigemComissao = 'reserva' | 'barco' | 'guia' | 'padrao';

/**
 * Cascata da comissão: o nível mais específico vence.
 * Devolve também de onde veio, para o extrato poder explicar o número.
 */
export function resolverComissao(o: OrigensComissao): {
  percentual: number;
  origem: OrigemComissao;
} {
  const candidatos: Array<[OrigemComissao, number | null | undefined]> = [
    ['reserva', o.reservaOverride],
    ['barco', o.barco],
    ['guia', o.guia],
    ['padrao', o.padrao],
  ];
  for (const [origem, valor] of candidatos) {
    if (valor !== null && valor !== undefined) {
      validarPercentual(valor, `comissão (${origem})`);
      return { percentual: valor, origem };
    }
  }
  throw new Error('Comissão padrão da plataforma não configurada.');
}

export interface EntradaReserva {
  precoBarcoCentavos: number;
  precoPassageiroCentavos: number;
  qtdPescadores: number;
  comissaoPercentual: number;
  sinalPercentual: number;
  /** Só aplica se o guia oferecer E o cliente for Diamond ativo. */
  descontoDiamondPercentual?: number;
  aplicarDescontoDiamond?: boolean;
}

export interface Reserva {
  valorTotalCentavos: number;
  descontoCentavos: number;
  valorLiquidoCentavos: number;
  comissaoCentavos: number;
  repasseGuiaCentavos: number;
  sinalCentavos: number;
  saldoCentavos: number;
}

export function calcularReserva(e: EntradaReserva): Reserva {
  validarInteiroNaoNegativo(e.precoBarcoCentavos, 'preço do barco');
  validarInteiroNaoNegativo(e.precoPassageiroCentavos, 'preço por passageiro');
  validarPercentual(e.comissaoPercentual, 'comissão');
  validarPercentual(e.sinalPercentual, 'sinal');

  if (!Number.isInteger(e.qtdPescadores) || e.qtdPescadores < 1) {
    throw new Error('Quantidade de pescadores deve ser um inteiro maior que zero.');
  }

  const valorTotalCentavos =
    e.precoBarcoCentavos + e.precoPassageiroCentavos * e.qtdPescadores;

  if (valorTotalCentavos <= 0) {
    throw new Error('Reserva sem valor: defina preço do barco ou por passageiro.');
  }

  const pctDesconto = e.aplicarDescontoDiamond ? (e.descontoDiamondPercentual ?? 0) : 0;
  validarPercentual(pctDesconto, 'desconto Diamond');

  const descontoCentavos = Math.round((valorTotalCentavos * pctDesconto) / 100);
  const valorLiquidoCentavos = valorTotalCentavos - descontoCentavos;

  const comissaoCentavos = Math.round((valorLiquidoCentavos * e.comissaoPercentual) / 100);
  const repasseGuiaCentavos = valorLiquidoCentavos - comissaoCentavos;

  const sinalCentavos = Math.round((valorLiquidoCentavos * e.sinalPercentual) / 100);
  const saldoCentavos = valorLiquidoCentavos - sinalCentavos;

  return {
    valorTotalCentavos,
    descontoCentavos,
    valorLiquidoCentavos,
    comissaoCentavos,
    repasseGuiaCentavos,
    sinalCentavos,
    saldoCentavos,
  };
}

/**
 * Divide a comissão entre as cobranças da reserva (sinal e quitação, ou uma
 * só quando o cliente quita no ato).
 *
 * A última cobrança absorve o arredondamento, de modo que a soma das taxas
 * sempre bate exatamente com a comissão total. Sem isso, um centavo perdido
 * a cada reserva faz o extrato divergir do Mercado Pago com o tempo.
 */
export function ratearComissao(
  valorLiquidoCentavos: number,
  comissaoCentavos: number,
  cobrancasCentavos: number[],
): number[] {
  if (cobrancasCentavos.length === 0) {
    throw new Error('É preciso ao menos uma cobrança para ratear a comissão.');
  }
  const soma = cobrancasCentavos.reduce((a, b) => a + b, 0);
  if (soma !== valorLiquidoCentavos) {
    throw new Error(
      `As cobranças somam ${soma}, mas o valor líquido é ${valorLiquidoCentavos}.`,
    );
  }
  if (comissaoCentavos > valorLiquidoCentavos) {
    throw new Error('Comissão maior que o valor líquido da reserva.');
  }

  const taxas: number[] = [];
  let acumulado = 0;
  for (let i = 0; i < cobrancasCentavos.length; i++) {
    const ultima = i === cobrancasCentavos.length - 1;
    if (ultima) {
      taxas.push(comissaoCentavos - acumulado);
    } else {
      const fatia = Math.round(
        (comissaoCentavos * cobrancasCentavos[i]) / valorLiquidoCentavos,
      );
      taxas.push(fatia);
      acumulado += fatia;
    }
  }
  return taxas;
}

/** Data limite para o cliente quitar o saldo. */
export function vencimentoQuitacao(dataPescaria: Date, prazoDias: number): Date {
  const d = new Date(dataPescaria);
  d.setUTCDate(d.getUTCDate() - prazoDias);
  return d;
}

function validarPercentual(v: number, nome: string): void {
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    throw new Error(`Percentual inválido para ${nome}: ${v}`);
  }
}

function validarInteiroNaoNegativo(v: number, nome: string): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`Valor inválido para ${nome}: ${v} (esperado inteiro em centavos)`);
  }
}
