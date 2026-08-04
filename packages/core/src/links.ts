/**
 * Links de parceiro: só o que é seguro abrir.
 *
 * O endereço é digitado no painel e depois aberto no aparelho de quem usa. Um
 * `javascript:` ali dentro vira execução de código na versão web; um `http://`
 * simples é bloqueado pelo iOS e o botão morre sem explicação. Então a regra é
 * curta e fechada: https, com domínio, e nada mais.
 *
 * A mesma regra vale no banco (restrição de coluna) e aqui. Duas checagens
 * porque são dois caminhos: o painel é conveniência, o banco é a garantia.
 */

/** O endereço normalizado, ou null se não for um link seguro de abrir. */
export function linkDeParceiro(bruto: string): string | null {
  const limpo = bruto.trim();
  if (limpo === '') return null;

  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return null;
  }

  // Lista fechada, não lista de proibidos: esquema novo que apareça amanhã
  // nasce recusado, em vez de nascer permitido até alguém lembrar de bloquear.
  if (url.protocol !== 'https:') return null;
  if (url.hostname === '' || !url.hostname.includes('.')) return null;
  if (url.username !== '' || url.password !== '') return null;

  return url.toString();
}

/** O domínio, para mostrar ao lado do botão: quem clica precisa saber para onde vai. */
export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
