/**
 * Anúncios de parceiros: quatro espaços configurados pelo master.
 *
 * Segunda fonte de renda, independente da comissão das pescarias.
 *
 * O clique é somado por uma função do banco, não por um `insert` daqui. Com
 * permissão de escrita na contagem, qualquer pessoa inflaria o número do
 * anúncio que quisesse — e é por esse número que se decide qual parceiro fica.
 */

import { supabase } from './supabase';

export interface Anuncio {
  id: string;
  posicao: number;
  titulo: string;
  chamada: string | null;
  /** Quem de fato vende. Aparece no cartão: a compra é feita fora daqui. */
  parceiro: string;
  url: string;
  codigo_desconto: string | null;
  ativo: boolean;
}

export interface DesempenhoDoAnuncio {
  posicao: number;
  titulo: string;
  parceiro: string;
  ativo: boolean;
  cliques: number;
}

const COLUNAS = 'id, posicao, titulo, chamada, parceiro, url, codigo_desconto, ativo';

/** Os anúncios que a pessoa pode ver. Desligado só aparece para o master. */
export async function anunciosVisiveis(): Promise<Anuncio[]> {
  const { data, error } = await supabase.from('anuncios').select(COLUNAS).order('posicao');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Anuncio[];
}

/**
 * Grava o espaço. `posicao` é a chave: trocar o parceiro do lugar 2 é
 * reescrever a linha 2, não criar uma quinta.
 */
export async function salvarAnuncio(
  anuncio: Omit<Anuncio, 'id'> & { id?: string },
): Promise<void> {
  const { error } = await supabase
    .from('anuncios')
    .upsert(
      {
        posicao: anuncio.posicao,
        titulo: anuncio.titulo,
        chamada: anuncio.chamada,
        parceiro: anuncio.parceiro,
        url: anuncio.url,
        codigo_desconto: anuncio.codigo_desconto,
        ativo: anuncio.ativo,
      },
      { onConflict: 'posicao' },
    );
  if (error) throw new Error(error.message);
}

export async function apagarAnuncio(posicao: number): Promise<void> {
  const { error } = await supabase.from('anuncios').delete().eq('posicao', posicao);
  if (error) throw new Error(error.message);
}

/** Soma um clique. Falhar aqui não pode atrapalhar quem está indo para a loja. */
export async function registrarClique(id: string): Promise<void> {
  await supabase.rpc('registrar_clique', { p_anuncio: id });
}

export async function desempenhoDosAnuncios(dias = 30): Promise<DesempenhoDoAnuncio[]> {
  const { data, error } = await supabase.rpc('desempenho_dos_anuncios', { p_dias: dias });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DesempenhoDoAnuncio[];
}
