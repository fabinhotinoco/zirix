/**
 * Guias: leitura e as duas decisões que só o master toma.
 *
 * As colunas `mp_*` não aparecem aqui de propósito. O acesso a elas é revogado
 * no banco (ver 0001_init.sql): são credenciais de terceiros e só as Edge
 * Functions, com service_role, podem lê-las. Pedi-las aqui devolveria erro.
 */

import { supabase } from './supabase';

export type StatusGuia = 'pendente' | 'aprovado' | 'suspenso';

export interface Guia {
  id: string;
  user_id: string;
  nome_operacao: string;
  documento: string | null;
  cidade: string | null;
  bio: string | null;
  status: StatusGuia;
  /** Nulo significa "usa o padrão da plataforma", não zero. */
  comissao_percentual: number | null;
  local_operacao_lat: number | null;
  local_operacao_lng: number | null;
  mp_conectado_em: string | null;
  aprovado_em: string | null;
  criado_em: string;
}

const COLUNAS =
  'id, user_id, nome_operacao, documento, cidade, bio, status, ' +
  'comissao_percentual, local_operacao_lat, local_operacao_lng, ' +
  'mp_conectado_em, aprovado_em, criado_em';

/** O guia do usuário logado, ou null se ele não for guia. */
export async function meuGuia(userId: string): Promise<Guia | null> {
  const { data, error } = await supabase
    .from('guides')
    .select(COLUNAS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Guia | null) ?? null;
}

/**
 * Todos os guias, para o master. Pendentes primeiro: é a fila de trabalho dele,
 * e deixá-la no fim da lista é o mesmo que escondê-la.
 */
export async function todosOsGuias(): Promise<Guia[]> {
  const { data, error } = await supabase
    .from('guides')
    .select(COLUNAS)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);

  const ordem: Record<StatusGuia, number> = { pendente: 0, aprovado: 1, suspenso: 2 };
  return ((data ?? []) as unknown as Guia[]).sort((a, b) => ordem[a.status] - ordem[b.status]);
}

/** Dados de apresentação — o que o próprio guia pode editar. */
export async function salvarDadosDoGuia(
  id: string,
  dados: {
    nome_operacao: string;
    documento: string | null;
    cidade: string | null;
    bio: string | null;
    /**
     * Onde a operação larga o barco.
     *
     * É daqui que a aba de condições tira o ponto da previsão. Sem coordenada,
     * a operação simplesmente não aparece naquela tela — melhor ficar de fora
     * que mostrar o tempo de outro lugar.
     */
    local_operacao_lat?: number | null;
    local_operacao_lng?: number | null;
  },
): Promise<void> {
  const { error } = await supabase.from('guides').update(dados).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Aprovação e comissão. O banco recusa isto para quem não é master
 * (0003_guia_nao_se_aprova.sql) — aqui é conveniência, não é a proteção.
 *
 * `comissao` nula grava nulo de propósito: é o guia herdando o padrão da
 * plataforma, que é diferente de comissão zero.
 */
export async function decidirSobreGuia(
  id: string,
  status: StatusGuia,
  comissao: number | null,
  masterId: string,
): Promise<void> {
  const { error } = await supabase
    .from('guides')
    .update({
      status,
      comissao_percentual: comissao,
      aprovado_por: status === 'aprovado' ? masterId : null,
      aprovado_em: status === 'aprovado' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Comissão padrão da plataforma, para mostrar o que o guia herda. */
export async function comissaoPadrao(): Promise<number | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('valor')
    .eq('chave', 'comissao_padrao_percentual')
    .maybeSingle();
  if (error) return null;
  const valor = (data as { valor: unknown } | null)?.valor;
  return typeof valor === 'number' ? valor : null;
}
