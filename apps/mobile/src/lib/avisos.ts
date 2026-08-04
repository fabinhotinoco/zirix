/**
 * Caixa de avisos.
 *
 * Nada aqui cria aviso: quem cria é o banco, no gatilho que dispara junto com o
 * fato (0008_avisos_e_agenda_do_guia.sql). A reserva pode nascer de madrugada e
 * o pagamento pode ser confirmado por um webhook — nos dois casos não existe
 * tela ligada para disparar nada. Este arquivo só lê e marca como lido.
 */

import { supabase } from './supabase';

export type TipoDeAviso =
  | 'reserva_criada'
  | 'reserva_confirmada'
  | 'reserva_cancelada'
  | 'reserva_expirada'
  | 'sinal_pago'
  | 'saldo_quitado'
  | 'saldo_em_aberto'
  | 'lembrete';

export interface Aviso {
  id: string;
  booking_id: string | null;
  tipo: TipoDeAviso;
  titulo: string;
  corpo: string;
  /** Retrato do dinheiro quando o aviso saiu. Nulo quando o aviso não fala de valores. */
  valor_total_centavos: number | null;
  valor_pago_centavos: number | null;
  valor_aberto_centavos: number | null;
  lida_em: string | null;
  criado_em: string;
}

const COLUNAS =
  'id, booking_id, tipo, titulo, corpo, valor_total_centavos, ' +
  'valor_pago_centavos, valor_aberto_centavos, lida_em, criado_em';

export async function meusAvisos(limite = 50): Promise<Aviso[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUNAS)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Aviso[];
}

/** Só o número, para o selo da tela inicial. */
export async function quantosNaoLidos(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('lida_em', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * O banco recusa qualquer outra alteração: um gatilho devolve as demais colunas
 * ao valor antigo. Marcar como lido não pode virar licença para reescrever o
 * que a pessoa foi avisada.
 */
export async function marcarLido(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ lida_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function marcarTodosLidos(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ lida_em: new Date().toISOString() })
    .is('lida_em', null);
  if (error) throw new Error(error.message);
}
