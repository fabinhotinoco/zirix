/**
 * Os pontos de pesca que a tela de condições pode consultar.
 *
 * Vêm das operações dos guias, e não de uma busca por cidade. O motivo é
 * prático: a condição que interessa é a do lugar onde o barco vai estar. Um
 * pescador que mora em Niterói e vai sair de Angra precisa da previsão de
 * Angra, não da janela dele.
 *
 * Quem é guia vê o próprio ponto primeiro. Quem é cliente vê o ponto do guia
 * com quem tem pescaria marcada — é a informação que ele vai procurar na
 * véspera.
 */

import type { TipoDeAgua } from '@pescavertical/core/pesca/tipos';

import { supabase } from './supabase';

export interface PontoDePesca {
  id: string;
  nome: string;
  cidade: string | null;
  lat: number;
  lng: number;
  /** Indefinido = a tela descobre pela cobertura de dados marinhos. */
  agua?: TipoDeAgua;
  /** Este ponto é o do guia logado, ou de uma reserva dele? */
  meu: boolean;
}

interface LinhaGuia {
  id: string;
  nome_operacao: string;
  cidade: string | null;
  local_operacao_lat: number | null;
  local_operacao_lng: number | null;
  user_id: string;
}

/**
 * Pontos disponíveis, com os mais relevantes primeiro.
 *
 * Guia sem coordenada cadastrada simplesmente não entra na lista — melhor que
 * aparecer e mostrar a previsão de um lugar errado.
 */
export async function pontosDePesca(userId: string | null): Promise<PontoDePesca[]> {
  const { data, error } = await supabase
    .from('guides')
    .select('id, nome_operacao, cidade, local_operacao_lat, local_operacao_lng, user_id')
    .eq('status', 'aprovado');

  if (error) throw new Error(error.message);

  const pontos = ((data ?? []) as LinhaGuia[])
    .filter((g) => g.local_operacao_lat !== null && g.local_operacao_lng !== null)
    .map<PontoDePesca>((g) => ({
      id: g.id,
      nome: g.nome_operacao,
      cidade: g.cidade,
      lat: g.local_operacao_lat as number,
      lng: g.local_operacao_lng as number,
      meu: userId !== null && g.user_id === userId,
    }));

  // O ponto de quem está olhando vem primeiro; o resto em ordem alfabética,
  // que é como se procura numa lista.
  return pontos.sort((a, b) =>
    a.meu === b.meu ? a.nome.localeCompare(b.nome, 'pt-BR') : a.meu ? -1 : 1,
  );
}

/**
 * O ponto da próxima pescaria do cliente, se houver.
 *
 * É o que ele quer ver ao abrir a tela na véspera — não a lista inteira de
 * operações da plataforma.
 */
export async function pontoDaProximaReserva(): Promise<string | null> {
  const { data, error } = await supabase.rpc('minhas_reservas');
  if (error || !Array.isArray(data)) return null;

  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = (data as Array<{ data: string; status: string; guia_nome: string }>)
    .filter((r) => r.data >= hoje && (r.status === 'confirmada' || r.status === 'pendente'))
    .sort((a, b) => a.data.localeCompare(b.data))[0];

  return proxima?.guia_nome ?? null;
}
