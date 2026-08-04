/**
 * O lado do cliente: procurar guia, ver datas livres, reservar.
 *
 * Repare no que NÃO existe aqui: nenhuma função que envie preço. O aplicativo
 * manda o que a pessoa quer — barco, data, quantas pessoas — e recebe de volta
 * a conta feita pelo servidor. Se o preço saísse daqui, bastaria um `curl` com
 * a chave publicável para reservar mil reais por um centavo.
 *
 * `datas_disponiveis` e `minhas_reservas` também são funções, e não consultas
 * às tabelas, porque o cliente não enxerga a reserva de outra pessoa — e
 * "este dia está ocupado" é, justamente, informação sobre a reserva alheia. As
 * funções devolvem o mínimo: que o dia está tomado, nunca por quem.
 */

import { supabase } from './supabase';

export interface GuiaPublico {
  id: string;
  nome_operacao: string;
  cidade: string | null;
  bio: string | null;
  foto_url: string | null;
}

export interface BarcoPublico {
  id: string;
  nome: string;
  modelo: string | null;
  capacidade_min: number;
  capacidade_max: number;
  equipamentos: string | null;
}

export interface DiaLivre {
  data: string;
  preco_barco_centavos: number;
  preco_passageiro_centavos: number;
  observacao: string | null;
}

export interface Participante {
  nome: string;
  telefone?: string | null;
}

export interface MinhaReserva {
  id: string;
  codigo: string | null;
  data: string;
  qtd_pescadores: number;
  valor_total_centavos: number;
  desconto_centavos: number;
  sinal_centavos: number;
  saldo_centavos: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'expirada';
  status_pagamento: 'aguardando_sinal' | 'sinal_pago' | 'quitada';
  quitacao_vence_em: string | null;
  expira_em: string | null;
  guia_nome: string;
  guia_cidade: string | null;
  barco_nome: string;
  participantes: Participante[];
}

/**
 * Operações abertas. A política do banco já devolve só as aprovadas — pedir
 * `status` aqui seria repetir a regra num lugar onde ela não é aplicada.
 */
export async function guiasAbertos(): Promise<GuiaPublico[]> {
  const { data, error } = await supabase
    .from('guides')
    .select('id, nome_operacao, cidade, bio, foto_url')
    .order('nome_operacao');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GuiaPublico[];
}

export async function barcosDoGuiaPublico(guideId: string): Promise<BarcoPublico[]> {
  const { data, error } = await supabase
    .from('boats')
    .select('id, nome, modelo, capacidade_min, capacidade_max, equipamentos')
    .eq('guide_id', guideId)
    .order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BarcoPublico[];
}

/** Um barco só. Devolve null se ele saiu do ar entre a lista e o toque. */
export async function barcoPublico(boatId: string): Promise<BarcoPublico | null> {
  const { data, error } = await supabase
    .from('boats')
    .select('id, nome, modelo, capacidade_min, capacidade_max, equipamentos')
    .eq('id', boatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as BarcoPublico | null) ?? null;
}

export async function datasDisponiveis(boatId: string): Promise<DiaLivre[]> {
  const { data, error } = await supabase.rpc('datas_disponiveis', { p_boat_id: boatId });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DiaLivre[];
}

/**
 * Cria a reserva. Os dois aceites vão explícitos porque o servidor recusa sem
 * eles: é o aceite por pescaria que tem valor probatório quando alguém cancela
 * meses depois e discorda da retenção.
 */
export async function criarReserva(pedido: {
  boatId: string;
  data: string;
  qtdPescadores: number;
  participantes: Participante[];
  aceitouPolitica: boolean;
  aceitouTermo: boolean;
}): Promise<{ id: string; valor_total_centavos: number; sinal_centavos: number }> {
  const { data, error } = await supabase.rpc('criar_reserva', {
    p_boat_id: pedido.boatId,
    p_data: pedido.data,
    p_qtd_pescadores: pedido.qtdPescadores,
    p_participantes: pedido.participantes.map((p) => ({
      nome: p.nome,
      telefone: p.telefone ?? null,
    })),
    p_aceitou_politica: pedido.aceitouPolitica,
    p_aceitou_termo: pedido.aceitouTermo,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { id: string; valor_total_centavos: number; sinal_centavos: number };
}

export async function minhasReservas(): Promise<MinhaReserva[]> {
  const { data, error } = await supabase.rpc('minhas_reservas');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MinhaReserva[];
}

export async function cancelarReserva(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_reserva', { p_id: id });
  if (error) throw new Error(error.message);
}

/** aaaa-mm-dd para dd/mm/aaaa. */
export function paraBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Quanto sairia a pescaria neste dia, para N pessoas. Só para mostrar. */
export function previaDoValor(dia: DiaLivre, qtd: number): number {
  return dia.preco_barco_centavos + dia.preco_passageiro_centavos * qtd;
}
