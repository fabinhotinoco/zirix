/**
 * Barcos e agenda.
 *
 * A agenda tem chave composta (barco + data): abrir uma data que já existe é
 * uma atualização, não um erro. Por isso `upsert` — sem ele, corrigir o preço
 * de um dia já aberto falharia com violação de chave, e a pessoa não teria
 * como saber que precisava apagar antes.
 */

import { supabase } from './supabase';

export interface Barco {
  id: string;
  guide_id: string;
  nome: string;
  modelo: string | null;
  capacidade_min: number;
  capacidade_max: number;
  equipamentos: string | null;
  status: 'ativo' | 'inativo';
}

export interface DiaDaAgenda {
  boat_id: string;
  data: string;
  status: 'aberto' | 'bloqueado';
  preco_barco_centavos: number;
  preco_passageiro_centavos: number;
  observacao: string | null;
}

const COLUNAS_BARCO =
  'id, guide_id, nome, modelo, capacidade_min, capacidade_max, equipamentos, status';

export async function barcosDoGuia(guideId: string): Promise<Barco[]> {
  const { data, error } = await supabase
    .from('boats')
    .select(COLUNAS_BARCO)
    .eq('guide_id', guideId)
    .order('criado_em', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Barco[];
}

export async function criarBarco(
  guideId: string,
  dados: Omit<Barco, 'id' | 'guide_id' | 'status'>,
): Promise<void> {
  const { error } = await supabase.from('boats').insert({ guide_id: guideId, ...dados });
  if (error) throw new Error(error.message);
}

export async function salvarBarco(
  id: string,
  dados: Partial<Omit<Barco, 'id' | 'guide_id'>>,
): Promise<void> {
  const { error } = await supabase.from('boats').update(dados).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Datas a partir de hoje. O passado não interessa para abrir agenda. */
export async function agendaDoBarco(boatId: string): Promise<DiaDaAgenda[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('boat_availability')
    .select('boat_id, data, status, preco_barco_centavos, preco_passageiro_centavos, observacao')
    .eq('boat_id', boatId)
    .gte('data', hoje)
    .order('data', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DiaDaAgenda[];
}

/**
 * Abre ou corrige um dia. O banco recusa se o guia não estiver aprovado e com
 * o Mercado Pago conectado (0005_porta_de_entrada_da_agenda.sql) — a mensagem
 * dele já explica o que falta, então não se traduz aqui.
 */
export async function abrirDia(dia: {
  boat_id: string;
  data: string;
  preco_barco_centavos: number;
  preco_passageiro_centavos: number;
  observacao: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('boat_availability')
    .upsert({ ...dia, status: 'aberto' }, { onConflict: 'boat_id,data' });
  if (error) throw new Error(error.message);
}

export async function fecharDia(boatId: string, data: string): Promise<void> {
  const { error } = await supabase
    .from('boat_availability')
    .delete()
    .eq('boat_id', boatId)
    .eq('data', data);
  if (error) throw new Error(error.message);
}
