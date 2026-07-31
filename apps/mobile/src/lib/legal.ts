/**
 * Acesso aos documentos legais e gravação dos aceites.
 *
 * A decisão de o que ainda falta aceitar vive em @pescavertical/core, para
 * ser a mesma regra no aplicativo e nas Edge Functions. Aqui fica só o
 * acesso ao banco.
 */

import {
  documentosPendentes,
  montarAceites,
  DOCUMENTOS_DO_CADASTRO,
  DOCUMENTOS_DA_RESERVA,
  type DocumentoSlug,
  type DocumentoVigente,
  type AceiteRegistrado,
  type PapelUsuario,
} from '@pescavertical/core/legal';

import { supabase } from './supabase';

export type { DocumentoVigente, DocumentoSlug, PapelUsuario };
export { DOCUMENTOS_DO_CADASTRO, DOCUMENTOS_DA_RESERVA };

/** Versão vigente de cada documento: a mais recente por slug. */
export async function buscarDocumentosVigentes(): Promise<DocumentoVigente[]> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('slug, versao, titulo, hash_sha256, vigente_desde')
    .lte('vigente_desde', new Date().toISOString())
    .order('vigente_desde', { ascending: false });

  if (error) throw new Error(`Não foi possível carregar os documentos: ${error.message}`);

  const maisRecentePorSlug = new Map<string, DocumentoVigente>();
  for (const linha of data ?? []) {
    if (!maisRecentePorSlug.has(linha.slug)) {
      maisRecentePorSlug.set(linha.slug, {
        slug: linha.slug as DocumentoSlug,
        versao: linha.versao,
        titulo: linha.titulo,
        hashSha256: linha.hash_sha256,
      });
    }
  }
  return [...maisRecentePorSlug.values()];
}

export async function buscarTextoDocumento(
  slug: DocumentoSlug,
  versao: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('corpo_markdown')
    .eq('slug', slug)
    .eq('versao', versao)
    .single();

  if (error) throw new Error(`Não foi possível abrir o documento: ${error.message}`);
  return data.corpo_markdown;
}

async function buscarAceites(userId: string): Promise<AceiteRegistrado[]> {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('documento_slug, versao, hash_sha256')
    .eq('user_id', userId);

  if (error) throw new Error(`Não foi possível verificar seus aceites: ${error.message}`);

  return (data ?? []).map((l) => ({
    documentoSlug: l.documento_slug as DocumentoSlug,
    versao: l.versao,
    hashSha256: l.hash_sha256,
  }));
}

/** O que o usuário ainda precisa aceitar para concluir o cadastro. */
export async function pendenciasDoCadastro(
  userId: string,
  papel: PapelUsuario,
): Promise<DocumentoVigente[]> {
  const [vigentes, aceitos] = await Promise.all([
    buscarDocumentosVigentes(),
    buscarAceites(userId),
  ]);
  return documentosPendentes(DOCUMENTOS_DO_CADASTRO[papel], vigentes, aceitos);
}

/** O que precisa ser aceito no fechamento de uma reserva. */
export async function pendenciasDaReserva(userId: string): Promise<DocumentoVigente[]> {
  const [vigentes, aceitos] = await Promise.all([
    buscarDocumentosVigentes(),
    buscarAceites(userId),
  ]);
  return documentosPendentes(DOCUMENTOS_DA_RESERVA, vigentes, aceitos);
}

/**
 * Grava os aceites. Recusa marcação parcial — a regra está no core.
 *
 * O `user_agent` identifica o aparelho; o IP é preenchido pelo servidor nas
 * Edge Functions, porque o valor informado pelo próprio aplicativo não teria
 * valor probatório nenhum.
 */
export async function registrarAceites(
  userId: string,
  pendentes: DocumentoVigente[],
  marcados: DocumentoSlug[],
  opcoes: { bookingId?: string; userAgent: string },
): Promise<void> {
  const rascunhos = montarAceites(pendentes, marcados, opcoes.bookingId);
  if (rascunhos.length === 0) return;

  const { error } = await supabase.from('terms_acceptances').insert(
    rascunhos.map((r) => ({
      user_id: userId,
      booking_id: r.bookingId ?? null,
      documento_slug: r.documentoSlug,
      versao: r.versao,
      hash_sha256: r.hashSha256,
      user_agent: opcoes.userAgent,
    })),
  );

  if (error) throw new Error(`Não foi possível registrar o aceite: ${error.message}`);
}
