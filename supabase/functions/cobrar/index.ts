/**
 * Cria a cobrança de uma reserva no Mercado Pago, em nome do guia.
 *
 * O aplicativo manda apenas **o id da reserva e o tipo da cobrança**. Valor e
 * comissão saem do banco, do que está congelado na reserva desde que ela foi
 * criada — quem informa o preço não pode ser quem paga.
 *
 * O SPLIT ACONTECE AQUI, numa linha: `marketplace_fee`. A preferência é criada
 * com o token DO GUIA, então o dinheiro entra na conta dele e o Mercado Pago
 * separa a comissão da plataforma na origem. A plataforma nunca recebe e
 * repassa — o que evita, de uma vez, o problema fiscal de ter faturamento de
 * terceiro passando pelo próprio CNPJ e o risco de ficar devendo repasse.
 *
 * QUEM É O PAGADOR vem do JWT que o Supabase já verificou antes de a função
 * rodar, não de um campo do corpo. Aceitar o id do usuário vindo do aplicativo
 * deixaria qualquer pessoa gerar cobrança em nome de outra.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MP_TOKEN_KEY = Deno.env.get('MP_TOKEN_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL')
  ?? 'https://aplicativo-de-agendamento-pesca-vertical.expo.app';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

/**
 * O `sub` do JWT que o Supabase já validou.
 *
 * A assinatura foi conferida antes de a função rodar (a publicação é COM
 * verify_jwt), então ler o payload aqui é seguro. O que não seria seguro é
 * confiar num id de usuário vindo do corpo da requisição.
 */
function usuarioDoToken(req: Request): string | null {
  const cabecalho = req.headers.get('authorization') ?? '';
  const token = cabecalho.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const carga = JSON.parse(
      atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { sub?: string };
    return carga.sub ?? null;
  } catch {
    return null;
  }
}

interface Cobranca {
  valor_centavos: number;
  fee_centavos: number;
  descricao: string;
  guide_id: string;
  mp_access_token: string;
  referencia_externa: string;
  email_pagador: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const faltando = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE],
    ['MP_TOKEN_KEY', MP_TOKEN_KEY],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length > 0) {
    console.error('configuração faltando:', faltando.join(', '));
    return json({ erro: 'A plataforma ainda não terminou de configurar o pagamento.' }, 500);
  }

  const userId = usuarioDoToken(req);
  if (!userId) return json({ erro: 'Faça login para pagar.' }, 401);

  let corpo: { booking_id?: string; tipo?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Pedido malformado.' }, 400);
  }

  const bookingId = corpo.booking_id ?? '';
  const tipo = corpo.tipo ?? '';
  if (!bookingId || !['sinal', 'saldo', 'integral'].includes(tipo)) {
    return json({ erro: 'Informe a reserva e o tipo da cobrança.' }, 400);
  }

  // ---------------------------------------------------------------------------
  // 1. Quanto cobrar — decidido pelo banco, não pelo aplicativo.
  // ---------------------------------------------------------------------------
  const preparo = await fetch(`${SUPABASE_URL}/rest/v1/rpc/preparar_cobranca`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_booking_id: bookingId,
      p_tipo: tipo,
      p_user_id: userId,
      p_chave: MP_TOKEN_KEY,
    }),
  });

  if (!preparo.ok) {
    const detalhe = await preparo.text();
    console.error('preparar_cobranca recusou:', preparo.status, detalhe);
    // As mensagens do banco são escritas para a pessoa ler — "Esta reserva já
    // teve o sinal pago", "O guia desconectou a conta". Repassá-las é melhor
    // que um "erro interno" genérico.
    const mensagem = (() => {
      try {
        return (JSON.parse(detalhe) as { message?: string }).message;
      } catch {
        return undefined;
      }
    })();
    return json({ erro: mensagem ?? 'Não foi possível preparar o pagamento.' }, 400);
  }

  const linhas = (await preparo.json()) as Cobranca[];
  const c = linhas[0];
  if (!c) return json({ erro: 'Não foi possível preparar o pagamento.' }, 400);

  // ---------------------------------------------------------------------------
  // 2. A preferência, com o token DO GUIA e a comissão no split.
  // ---------------------------------------------------------------------------
  const preferencia = {
    items: [{
      id: c.referencia_externa,
      title: c.descricao,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: c.valor_centavos / 100,
    }],
    // É esta linha que divide o dinheiro na origem.
    marketplace_fee: c.fee_centavos / 100,
    external_reference: c.referencia_externa,
    ...(c.email_pagador ? { payer: { email: c.email_pagador } } : {}),
    back_urls: {
      success: `${APP_URL}/reservas`,
      pending: `${APP_URL}/reservas`,
      failure: `${APP_URL}/reservas`,
    },
    auto_return: 'approved',
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
    // Pix e dinheiro em conta primeiro: a liberação é imediata, o que é o que
    // permite devolver de verdade num cancelamento. Cartão parcelado libera aos
    // poucos e é a origem do estorno que não completa.
    payment_methods: { installments: 12 },
  };

  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${c.mp_access_token}`,
        // Evita criar duas preferências se o aplicativo repetir o pedido.
        'x-idempotency-key': `${c.referencia_externa}:${c.valor_centavos}`,
      },
      body: JSON.stringify(preferencia),
    });

    const resposta = (await r.json()) as Record<string, unknown>;

    if (!r.ok || !resposta.init_point) {
      console.error('Mercado Pago recusou a preferência:', r.status, resposta?.message);
      return json({ erro: 'O Mercado Pago recusou a cobrança. Tente de novo em instantes.' }, 502);
    }

    return json({
      url: resposta.init_point,
      sandbox_url: resposta.sandbox_init_point ?? null,
      preference_id: resposta.id ?? null,
      valor_centavos: c.valor_centavos,
      // A comissão vai para a tela poder mostrar ao guia o que ele recebe. Não
      // é segredo: ela está no contrato de adesão dele.
      fee_centavos: c.fee_centavos,
    });
  } catch (e) {
    console.error('falha de rede ao criar a cobrança:', e);
    return json({ erro: 'Não consegui falar com o Mercado Pago agora.' }, 502);
  }
});
