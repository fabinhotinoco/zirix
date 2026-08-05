/**
 * Configuração do aplicativo, lida das variáveis EXPO_PUBLIC_*.
 *
 * Falha alto e cedo quando algo falta. Um app que sobe sem a chave do banco e
 * só quebra na primeira tela de dados é muito pior de diagnosticar do que um
 * que se recusa a iniciar dizendo exatamente o que está faltando.
 *
 * Sobre a chave: o Supabase está migrando das chaves JWT antigas (`anon`,
 * um token longo começando com `eyJ`) para as novas chaves publicáveis
 * (`sb_publishable_…`). Aceitamos as duas — a nova tem preferência — para a
 * troca não exigir mexer no código.
 *
 * Ambas são públicas por natureza: vão embutidas no aplicativo que qualquer
 * pessoa baixa da loja. Quem protege os dados é o RLS no banco.
 */

function primeiraDefinida(
  candidatas: Array<[nome: string, valor: string | undefined]>,
): string {
  for (const [, valor] of candidatas) {
    if (valor && valor.trim() && !valor.startsWith('cole-aqui')) return valor.trim();
  }
  const nomes = candidatas.map(([nome]) => nome).join(' ou ');
  throw new Error(
    `Falta a variável ${nomes}.\n` +
      'Copie apps/mobile/.env.example para .env e preencha os valores.',
  );
}

export const config = {
  supabaseUrl: primeiraDefinida([
    ['EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL],
  ]),
  supabaseKey: primeiraDefinida([
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY],
  ]),

  /**
   * Identificador público da aplicação no Mercado Pago.
   *
   * Não é segredo: viaja à vista no endereço que o guia abre para autorizar.
   * O segredo que faz par com ele mora no servidor, e é por isso que a troca
   * do código pelo token acontece lá, não aqui.
   *
   * Diferente dos dois acima, este NÃO derruba o aplicativo quando falta: só
   * o guia conectando conta depende dele. Cliente nenhum ficaria sem reservar
   * porque a configuração de pagamento não foi preenchida.
   */
  mpClientId: (process.env.EXPO_PUBLIC_MP_CLIENT_ID ?? '').trim(),
} as const;
