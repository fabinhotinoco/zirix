/**
 * Retorno da autorização do Mercado Pago.
 *
 * O guia aperta "Conectar Mercado Pago" no aplicativo, autoriza numa página do
 * Mercado Pago, e o navegador dele volta PARA CÁ com um código de uso único.
 * Esta função troca esse código pelo token do guia e guarda cifrado.
 *
 * POR QUE ISTO NÃO PODE MORAR NO APLICATIVO:
 *
 * A troca do código pelo token exige o `client_secret` da plataforma. O
 * aplicativo é distribuído para o celular de todo mundo — qualquer segredo
 * dentro dele é segredo de ninguém, e quem o extraísse falaria com o Mercado
 * Pago em nome da plataforma. Por isso a troca acontece aqui, onde o segredo
 * fica no cofre do Supabase.
 *
 * QUEM ESTÁ VOLTANDO?
 *
 * Não há sessão nenhuma nesta requisição: é o navegador do guia chegando de um
 * site de terceiro, sem token do nosso aplicativo. Quem responde por essa
 * identidade é o `state` — um segredo de uso único que o aplicativo pediu ao
 * banco ANTES de abrir a autorização, gravado junto com o id do guia. Sem ele,
 * qualquer pessoa que descobrisse este endereço penduraria a própria conta do
 * Mercado Pago no cadastro de um guia qualquer.
 *
 * Publicada com `--no-verify-jwt`: quem chega aqui é o Mercado Pago mandando o
 * navegador de volta, sem cabeçalho de autorização. A verificação de quem é
 * está no `state`, não num JWT que não existe.
 */

const MP_CLIENT_ID = Deno.env.get('MP_CLIENT_ID') ?? '';
const MP_CLIENT_SECRET = Deno.env.get('MP_CLIENT_SECRET') ?? '';
const MP_REDIRECT_URI = Deno.env.get('MP_REDIRECT_URI') ?? '';
const MP_TOKEN_KEY = Deno.env.get('MP_TOKEN_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Endereço do aplicativo instalado, para o botão de voltar. */
const APP_DEEP_LINK = 'pescaverticalapp://';

/**
 * Página de resposta.
 *
 * O guia está num navegador, não numa API. Devolver JSON aqui seria devolver
 * uma tela de código para alguém que só quer saber se deu certo.
 */
function pagina(titulo: string, corpo: string, ok: boolean): Response {
  const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
         justify-content:center; background:#060B10; color:#E6EEF2;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         padding:24px; }
  .cartao { max-width:420px; text-align:center; }
  .marca { width:56px; height:56px; margin:0 auto 20px; border-radius:16px;
           background:${ok ? '#22E0C8' : '#3A2430'}; display:flex;
           align-items:center; justify-content:center; font-size:28px;
           color:${ok ? '#00201C' : '#FF8FA3'}; }
  h1 { font-size:22px; margin:0 0 12px; }
  p { color:#8FA3AD; line-height:1.55; margin:0 0 24px; font-size:15px; }
  a { display:inline-block; background:#22E0C8; color:#00201C; font-weight:700;
      text-decoration:none; padding:14px 28px; border-radius:12px; }
</style></head>
<body><div class="cartao">
  <div class="marca">${ok ? '✓' : '!'}</div>
  <h1>${titulo}</h1>
  <p>${corpo}</p>
  <a href="${APP_DEEP_LINK}">Voltar ao aplicativo</a>
</div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Falta de configuração é erro nosso, e precisa aparecer como nosso — não
  // como "o Mercado Pago recusou". Sem isto, um segredo que o robô 13 esqueceu
  // de publicar vira meia hora procurando defeito no lugar errado.
  const faltando = [
    ['MP_CLIENT_ID', MP_CLIENT_ID],
    ['MP_CLIENT_SECRET', MP_CLIENT_SECRET],
    ['MP_REDIRECT_URI', MP_REDIRECT_URI],
    ['MP_TOKEN_KEY', MP_TOKEN_KEY],
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE],
  ].filter(([, v]) => !v).map(([n]) => n);

  if (faltando.length > 0) {
    console.error('configuração faltando:', faltando.join(', '));
    return pagina(
      'Configuração incompleta',
      'A plataforma ainda não terminou de configurar o recebimento. Avise o administrador — nada foi conectado.',
      false,
    );
  }

  // O guia pode ter clicado em "cancelar" na tela do Mercado Pago.
  const erro = url.searchParams.get('error');
  if (erro) {
    return pagina(
      'Autorização não concluída',
      'Você não autorizou a conexão, ou a autorização foi cancelada. Sua conta continua como estava.',
      false,
    );
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return pagina(
      'Endereço incompleto',
      'Este endereço só funciona quando o Mercado Pago traz você de volta. Comece pelo botão de conectar dentro do aplicativo.',
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // Trocar o código pelo token do guia.
  //
  // O `redirect_uri` vai aqui de novo, e precisa ser IDÊNTICO ao usado na
  // autorização — é assim que o Mercado Pago confirma que quem troca é quem
  // pediu. Uma barra a mais e ele recusa.
  // ---------------------------------------------------------------------------
  let dados: Record<string, unknown>;
  try {
    const resposta = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        code,
        redirect_uri: MP_REDIRECT_URI,
      }),
    });

    dados = await resposta.json();

    if (!resposta.ok || !dados.access_token) {
      // O corpo pode repetir o que enviamos, inclusive o segredo. Só o campo de
      // mensagem vai para o registro.
      console.error('Mercado Pago recusou a troca:', resposta.status, dados?.message ?? dados?.error);
      return pagina(
        'O Mercado Pago recusou',
        'Não foi possível concluir a conexão. Tente de novo pelo aplicativo; se repetir, avise o administrador.',
        false,
      );
    }
  } catch (e) {
    console.error('falha de rede ao falar com o Mercado Pago:', e);
    return pagina(
      'Não foi possível falar com o Mercado Pago',
      'A conexão com o Mercado Pago falhou no meio do caminho. Tente de novo pelo aplicativo.',
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // Guardar. Quem valida o `state` e cifra é o banco — aqui a chave só passa.
  // ---------------------------------------------------------------------------
  try {
    const gravar = await fetch(`${SUPABASE_URL}/rest/v1/rpc/concluir_conexao_mp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SERVICE_ROLE,
        authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        p_state: state,
        p_mp_user_id: String(dados.user_id ?? ''),
        p_access_token: dados.access_token,
        p_refresh_token: dados.refresh_token ?? null,
        p_chave: MP_TOKEN_KEY,
      }),
    });

    if (!gravar.ok) {
      const detalhe = await gravar.text();
      console.error('banco recusou a gravação:', gravar.status, detalhe);

      // Erro de `state` é a situação normal de link velho ou reaberto, e merece
      // um texto que diga o que fazer — não "erro interno".
      const expirado = detalhe.includes('demorou demais')
        || detalhe.includes('já foi usada')
        || detalhe.includes('não reconhecida');

      return pagina(
        expirado ? 'Esta autorização não vale mais' : 'Não foi possível salvar',
        expirado
          ? 'O link de autorização é de uso único e vale por 15 minutos. Volte ao aplicativo e comece de novo.'
          : 'A conexão foi autorizada, mas não conseguimos registrá-la. Tente de novo pelo aplicativo.',
        false,
      );
    }
  } catch (e) {
    console.error('falha ao gravar a conexão:', e);
    return pagina(
      'Não foi possível salvar',
      'A conexão foi autorizada, mas não conseguimos registrá-la. Tente de novo pelo aplicativo.',
      false,
    );
  }

  return pagina(
    'Conta conectada',
    'Sua conta do Mercado Pago está ligada à plataforma. A partir de agora você já pode publicar datas na sua agenda, e o valor de cada pescaria cai direto na sua conta.',
    true,
  );
});
