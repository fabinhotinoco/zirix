/**
 * Traduz os erros do Supabase Auth para algo acionável.
 *
 * O que motivou este arquivo: a tela chegou a mostrar `{}` em vermelho. Quando
 * o servidor responde com um corpo de erro vazio, o supabase-js usa
 * `JSON.stringify` do corpo como mensagem — e sobra isso. Uma mensagem que não
 * diz nem o que falhou nem o que fazer é pior do que nenhuma: manda a pessoa
 * tentar de novo sem motivo para o resultado mudar.
 *
 * Além de traduzir, este módulo sempre anexa o código e o status HTTP. É essa
 * parte que permite diagnosticar sem estar na frente do aparelho.
 */

interface ErroSupabase {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

/** Casos que já aconteceram ou que têm conserto conhecido no painel. */
const CONHECIDOS: Record<string, string> = {
  otp_disabled:
    'O Supabase está com o cadastro de novos usuários desligado. Ligue em ' +
    'Authentication → Sign In / Providers → "Allow new users to sign up".',
  signup_disabled:
    'O Supabase está com o cadastro de novos usuários desligado. Ligue em ' +
    'Authentication → Sign In / Providers → "Allow new users to sign up".',
  email_provider_disabled:
    'A entrada por e-mail está desligada no Supabase. Ligue em ' +
    'Authentication → Providers → Email.',
  over_email_send_rate_limit:
    'O Supabase só envia 2 e-mails por hora no serviço embutido. Espere uma ' +
    'hora ou configure um serviço de e-mail próprio.',
  email_address_invalid: 'Esse endereço de e-mail não foi aceito. Confira se está correto.',
  otp_expired: 'Esse código expirou ou já foi usado. Peça outro.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Essa conta ainda não teve o e-mail confirmado.',
  validation_failed: 'Os dados enviados não foram aceitos. Confira o e-mail digitado.',
};

const POR_STATUS: Record<number, string> = {
  429: 'Muitas tentativas em pouco tempo. Espere alguns minutos.',
  500: 'O Supabase falhou ao processar o pedido — normalmente é o envio de ' +
    'e-mail. Confira as configurações de SMTP no painel.',
  503: 'O serviço do Supabase está indisponível no momento.',
};

/**
 * Devolve uma frase para mostrar na tela. Sempre inclui código e status quando
 * existirem: sem isso, um erro novo vira adivinhação.
 */
export function mensagemDeErro(e: unknown, padrao: string): string {
  if (!(e instanceof Error)) return padrao;

  const erro = e as Error & ErroSupabase;
  const codigo = erro.code;
  const status = erro.status;

  const explicacao =
    (codigo && CONHECIDOS[codigo]) ||
    (status && POR_STATUS[status]) ||
    // `{}` e strings vazias vêm de corpo de erro vazio: não servem de mensagem.
    (erro.message && erro.message !== '{}' ? erro.message : padrao);

  const detalhes = [codigo, status ? `HTTP ${status}` : null].filter(Boolean);
  return detalhes.length > 0 ? `${explicacao} (${detalhes.join(' · ')})` : explicacao;
}
