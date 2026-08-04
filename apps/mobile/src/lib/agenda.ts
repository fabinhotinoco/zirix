/**
 * A agenda: a do guia e a do master.
 *
 * Uma função só no banco, e não duas. A regra de quem enxerga o quê tem de
 * morar num lugar — duas consultas parecidas divergem, e no dia em que
 * divergirem o lado que vaza é o do master vendo tudo.
 *
 * Nada aqui filtra por guia como proteção: `guiaId` só estreita o que o banco
 * já permitiu. Um guia que passe o identificador de outro recebe zero linhas,
 * porque lá dentro o filtro de dono vem antes.
 */

import { supabase } from './supabase';

export interface LinhaDaAgenda {
  data: string;
  hora_saida: string | null;
  guide_id: string;
  guia_nome: string;
  boat_id: string;
  barco_nome: string;
  /** Nulo quando o dia foi fechado mas a reserva continua de pé. */
  dia_status: 'aberto' | 'bloqueado' | null;
  preco_barco_centavos: number | null;
  preco_passageiro_centavos: number | null;
  observacao: string | null;

  booking_id: string | null;
  reserva_status: 'pendente' | 'confirmada' | null;
  status_pagamento: 'aguardando_sinal' | 'sinal_pago' | 'quitada' | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  qtd_pescadores: number | null;

  /** Nulos no dia livre. Zero seria dizer que existe pescaria e ninguém pagou. */
  valor_liquido_centavos: number | null;
  valor_pago_centavos: number | null;
  valor_aberto_centavos: number | null;
  repasse_guia_centavos: number | null;
  comissao_centavos: number | null;
}

export interface GuiaDoFiltro {
  id: string;
  nome_operacao: string;
  cidade: string | null;
}

export async function agenda(
  de: string,
  ate: string,
  guiaId?: string | null,
): Promise<LinhaDaAgenda[]> {
  const { data, error } = await supabase.rpc('agenda', {
    p_de: de,
    p_ate: ate,
    p_guia: guiaId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LinhaDaAgenda[];
}

/** Operações aprovadas, para o filtro do master. Vazia para quem não é master. */
export async function guiasComAgenda(): Promise<GuiaDoFiltro[]> {
  const { data, error } = await supabase.rpc('guias_com_agenda');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GuiaDoFiltro[];
}

export interface ResumoDoPeriodo {
  dias: number;
  reservados: number;
  livres: number;
  aReceber: number;
  comissao: number;
  recebido: number;
  emAberto: number;
}

/** O total do período. Só soma o que tem reserva — dia livre não entra em conta. */
export function resumir(linhas: LinhaDaAgenda[]): ResumoDoPeriodo {
  const comReserva = linhas.filter((l) => l.booking_id !== null);
  const soma = (f: (l: LinhaDaAgenda) => number | null) =>
    comReserva.reduce((s, l) => s + (f(l) ?? 0), 0);

  return {
    dias: linhas.length,
    reservados: comReserva.length,
    livres: linhas.length - comReserva.length,
    aReceber: soma((l) => l.repasse_guia_centavos),
    comissao: soma((l) => l.comissao_centavos),
    recebido: soma((l) => l.valor_pago_centavos),
    emAberto: soma((l) => l.valor_aberto_centavos),
  };
}

export type EstadoDoDia = 'confirmada' | 'pendente' | 'aberto' | 'bloqueado';

/** Em que pé está uma saída — é o que decide a cor no calendário. */
export function estadoDa(l: LinhaDaAgenda): EstadoDoDia {
  if (l.reserva_status === 'confirmada') return 'confirmada';
  if (l.reserva_status === 'pendente') return 'pendente';
  return l.dia_status === 'bloqueado' ? 'bloqueado' : 'aberto';
}

/** As linhas agrupadas por data, para a grade do calendário. */
export function porData(linhas: LinhaDaAgenda[]): Record<string, LinhaDaAgenda[]> {
  return linhas.reduce<Record<string, LinhaDaAgenda[]>>((mapa, l) => {
    (mapa[l.data] ??= []).push(l);
    return mapa;
  }, {});
}
