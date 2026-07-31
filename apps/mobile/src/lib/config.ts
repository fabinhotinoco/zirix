/**
 * Configuração do aplicativo, lida das variáveis EXPO_PUBLIC_*.
 *
 * Falha alto e cedo quando algo falta. Um app que sobe sem a URL do banco e
 * só quebra na primeira tela de dados é muito pior de diagnosticar do que um
 * que se recusa a iniciar dizendo exatamente o que está faltando.
 */

function exigir(nome: string, valor: string | undefined): string {
  if (!valor || valor.startsWith('cole-aqui')) {
    throw new Error(
      `Falta a variável ${nome}.\n` +
        'Copie apps/mobile/.env.example para .env e preencha os valores.',
    );
  }
  return valor;
}

export const config = {
  supabaseUrl: exigir(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: exigir(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
