// Passo 1 do teste: conectar a conta de um GUIA à aplicação Marketplace.
//
//   node oauth.mjs url            → imprime o link de autorização
//   node oauth.mjs trocar <code>  → troca o code pelo access_token do guia
//
// Não é preciso subir servidor: depois de autorizar no navegador, o Mercado
// Pago redireciona para a redirect_uri com ?code=... na barra de endereço.
// Copie esse code e rode o segundo comando.

import { carregarEnv, exigir, mp, instalarTratamentoDeErro } from './lib.mjs';

instalarTratamentoDeErro();
carregarEnv();

const comando = process.argv[2];

if (comando === 'url') {
  const clientId = exigir('MP_CLIENT_ID');
  const redirect = exigir('MP_REDIRECT_URI');
  const url = new URL('https://auth.mercadopago.com.br/authorization');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('state', `teste-${Date.now()}`);

  console.log('\n1. Abra este link JÁ LOGADO na conta do GUIA (não na sua):\n');
  console.log(url.toString());
  console.log('\n2. Autorize. O navegador vai para a redirect_uri com ?code=XXXX na URL.');
  console.log('3. Copie o code e rode:  node oauth.mjs trocar <code>\n');
} else if (comando === 'trocar') {
  const code = process.argv[3];
  if (!code) {
    console.error('Uso: node oauth.mjs trocar <code>');
    process.exit(1);
  }
  const dados = await mp('/oauth/token', {
    metodo: 'POST',
    corpo: {
      client_id: exigir('MP_CLIENT_ID'),
      client_secret: exigir('MP_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: exigir('MP_REDIRECT_URI'),
    },
  });

  console.log('\n✓ Conta do guia conectada.\n');
  console.log(`  user_id do guia : ${dados.user_id}`);
  console.log(`  expira em       : ${dados.expires_in}s`);
  console.log(`  escopo          : ${dados.scope ?? '(não informado)'}`);
  console.log('\nAdicione ao .env:\n');
  console.log(`MP_GUIA_ACCESS_TOKEN=${dados.access_token}`);
  console.log(`MP_GUIA_REFRESH_TOKEN=${dados.refresh_token}`);
  console.log(`MP_GUIA_USER_ID=${dados.user_id}\n`);
  console.log('Em produção esses tokens ficam CIFRADOS no banco, nunca no app.\n');
} else {
  console.log(`
Uso:
  node oauth.mjs url            imprime o link de autorização do guia
  node oauth.mjs trocar <code>  troca o code pelo access_token do guia
`);
}
