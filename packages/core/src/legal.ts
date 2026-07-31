/**
 * Documentos legais e registro de aceite.
 *
 * O que dá valor probatório ao aceite não é a versão — é o **hash do texto**.
 * Versão é rótulo, e rótulo pode ser reaproveitado depois de uma edição. O
 * hash prova exatamente qual redação a pessoa leu quando marcou a caixa.
 *
 * Usa Web Crypto (não `node:crypto`) para o mesmo código rodar no aplicativo,
 * nas Edge Functions em Deno e no Node.
 */

export type DocumentoSlug =
  | 'contrato_guia'
  | 'contrato_cliente'
  | 'politica_cancelamento'
  | 'termo_responsabilidade'
  | 'politica_privacidade';

export interface DocumentoVigente {
  slug: DocumentoSlug;
  versao: string;
  titulo: string;
  hashSha256: string;
}

export interface AceiteRegistrado {
  documentoSlug: DocumentoSlug;
  versao: string;
  hashSha256: string;
}

/** Papel do usuário para decidir quais documentos são exigidos. */
export type PapelUsuario = 'cliente' | 'guia';

/** Exigidos no cadastro, antes de o usuário poder usar o aplicativo. */
export const DOCUMENTOS_DO_CADASTRO: Record<PapelUsuario, DocumentoSlug[]> = {
  cliente: ['contrato_cliente', 'politica_privacidade'],
  guia: ['contrato_guia', 'politica_privacidade'],
};

/** Exigidos a cada reserva — é o aceite por pescaria que tem valor em juízo. */
export const DOCUMENTOS_DA_RESERVA: DocumentoSlug[] = [
  'politica_cancelamento',
  'termo_responsabilidade',
];

/** SHA-256 em hexadecimal, igual ao que o gatilho do Postgres calcula. */
export async function calcularHash(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Quais documentos ainda faltam ser aceitos.
 *
 * Um documento é pendente quando nunca foi aceito **ou** quando o texto mudou
 * desde o aceite anterior — comparando pelo hash, não pela versão. Assim, se
 * alguém publicar uma correção reaproveitando o número da versão, o app pede
 * o aceite de novo em vez de deixar passar silenciosamente.
 */
export function documentosPendentes(
  exigidos: DocumentoSlug[],
  vigentes: DocumentoVigente[],
  aceitos: AceiteRegistrado[],
): DocumentoVigente[] {
  const pendentes: DocumentoVigente[] = [];

  for (const slug of exigidos) {
    const vigente = vigentes.find((d) => d.slug === slug);
    if (!vigente) {
      throw new Error(
        `Documento obrigatório "${slug}" não está publicado. ` +
          'Publique-o no painel antes de liberar o cadastro.',
      );
    }
    const jaAceito = aceitos.some(
      (a) => a.documentoSlug === slug && a.hashSha256 === vigente.hashSha256,
    );
    if (!jaAceito) pendentes.push(vigente);
  }

  return pendentes;
}

export interface RascunhoAceite {
  documentoSlug: DocumentoSlug;
  versao: string;
  hashSha256: string;
  bookingId?: string;
}

/**
 * Monta os registros de aceite a gravar.
 *
 * Recusa marcações parciais de propósito: aceite tem de ser afirmativo e
 * completo. Caixa desmarcada por padrão, uma por documento, e o botão de
 * continuar só habilita quando todas estiverem marcadas.
 */
export function montarAceites(
  pendentes: DocumentoVigente[],
  marcados: DocumentoSlug[],
  bookingId?: string,
): RascunhoAceite[] {
  const faltando = pendentes.filter((d) => !marcados.includes(d.slug));
  if (faltando.length > 0) {
    throw new Error(
      `Faltam aceitar: ${faltando.map((d) => d.titulo).join(', ')}`,
    );
  }
  return pendentes.map((d) => ({
    documentoSlug: d.slug,
    versao: d.versao,
    hashSha256: d.hashSha256,
    bookingId,
  }));
}
