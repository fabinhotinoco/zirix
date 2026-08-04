/**
 * A agenda do guia, todos os barcos juntos.
 *
 * Vem de uma função do banco e não de consultas soltas: uma linha reúne preço,
 * reserva, cliente e dinheiro, e montar isso no aplicativo exigiria quatro
 * consultas — com a chance de uma delas trazer o que o guia não pode ver.
 */

import { supabase } from './supabase';

export interface LinhaDaAgenda {
  data: string;
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
}

export async function agendaDoGuia(de: string, ate: string): Promise<LinhaDaAgenda[]> {
  const { data, error } = await supabase.rpc('agenda_do_guia', { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LinhaDaAgenda[];
}

export interface ResumoDoPeriodo {
  dias: number;
  reservados: number;
  livres: number;
  aReceber: number;
  recebido: number;
  emAberto: number;
}

/** O total do período. Só soma o que tem reserva — dia livre não entra em conta. */
export function resumir(linhas: LinhaDaAgenda[]): ResumoDoPeriodo {
  const comReserva = linhas.filter((l) => l.booking_id !== null);
  return {
    dias: linhas.length,
    reservados: comReserva.length,
    livres: linhas.length - comReserva.length,
    aReceber: comReserva.reduce((s, l) => s + (l.repasse_guia_centavos ?? 0), 0),
    recebido: comReserva.reduce((s, l) => s + (l.valor_pago_centavos ?? 0), 0),
    emAberto: comReserva.reduce((s, l) => s + (l.valor_aberto_centavos ?? 0), 0),
  };
}
