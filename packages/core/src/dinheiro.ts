/**
 * Conversão entre o que a pessoa digita e centavos.
 *
 * Todo dinheiro no projeto é inteiro em centavos — nunca ponto flutuante. Esta
 * é a fronteira onde texto vira número, e é por isso que ela é rigorosa: um
 * "1.500" interpretado como R$ 1,50 em vez de R$ 1.500,00 erra o preço de um
 * passeio em mil vezes, e nada depois disso perceberia.
 */

/**
 * Lê o que foi digitado e devolve centavos, ou `null` se não der para entender.
 *
 * Aceita as formas que aparecem de verdade num teclado brasileiro:
 *
 *   "1.500,50"  → 150050    (ponto de milhar, vírgula decimal)
 *   "1500,5"    → 150050
 *   "1500.50"   → 150050    (ponto decimal, como no teclado numérico do iOS)
 *   "1500"      → 150000
 *   "R$ 80"     →   8000
 *
 * O caso ambíguo é `"1.500"`: pode ser mil e quinhentos com ponto de milhar, ou
 * um e meio com ponto decimal. Decidido pelo tamanho do grupo final — três
 * dígitos depois do ponto é milhar, porque centavos nunca têm três casas.
 */
export function paraCentavos(bruto: string): number | null {
  const limpo = bruto.replace(/[R$\s ]/gi, '');
  if (limpo === '') return null;
  if (!/^[0-9.,]+$/.test(limpo)) return null;

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');

  let normalizado: string;

  if (temVirgula) {
    // Com vírgula presente, ela é o separador decimal e o ponto é de milhar.
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (temPonto) {
    const partes = limpo.split('.');
    const ultima = partes[partes.length - 1];
    // "1.500" = mil e quinhentos; "1.50" = um e cinquenta.
    normalizado =
      partes.length > 2 || ultima.length === 3 ? limpo.replace(/\./g, '') : limpo;
  } else {
    normalizado = limpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0) return null;

  // Arredondar aqui, e não truncar: 0,1 + 0,2 em ponto flutuante daria 10,999…
  // centavos, e truncar transformaria isso em 10.
  const centavos = Math.round(valor * 100);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Centavos para o texto que aparece na tela. */
export function formatarBRL(centavos: number): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const resto = String(abs % 100).padStart(2, '0');
  const comMilhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sinal}R$ ${comMilhar},${resto}`;
}
