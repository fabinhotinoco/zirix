/**
 * Aviso de pagamento do Mercado Pago.
 *
 * O QUE PROTEGE ESTE ENDEREÇO, já que ele é público e sem login.
 *
 * Qualquer pessoa pode mandar um POST aqui dizendo "o pagamento X foi
 * aprovado". A proteção não é acreditar no corpo da mensagem — é **não usar o
 * corpo para nada além do id**. O valor, o status e o método são lidos de volta
 * da API do Mercado Pago, com o token do guia dono da conta. Um pagamento
 * inventado simplesmente não existe lá, e a leitura falha.
 *
 * É por isso que a função é publicada com `--no-verify-jwt`: quem chama é o
 * Mercado Pago, que não tem como carregar um token nosso.
 *
 * DE QUAL GUIA É O PAGAMENTO. O aviso traz o `user_id` da conta no Mercado
 * Pago. Como cada guia conectou a própria conta, esse número identifica o dono
 * — e é com o token dele que o pagamento é lido. Sem isso, não haveria como
 * consultar um pagamento que vive na conta de outra pessoa.
 *
 * QUANDO FALHAR, FALHAR ALTO. Devolver 200 para um aviso que não conseguimos
 * processar faz o Mercado Pago parar de reenviar — e o pagamento se perde em
 * silêncio. Por isso o erro devolve 500: o provedor tenta de novo.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MP_TOKEN_KEY = Deno.env.get('MP_TOKEN_KEY') ?? '';

/** Como o Mercado Pago nomeia os estados, e como a plataforma os chama. */
const STATUS: Record<string, string> = {
  approved: 'aprovado',
  authorized: 'aprovado',
  pending: 'pendente',
  in_process: 'pendente',
  in_mediation: 'pendente',
  rejected: 'recusado',
  cancelled: 'recusado',
  refunded: 'estornado',
  charged_back: 'estornado',
};

const METODO: Record<string, string> = {
  pix: 'pix',
  credit_card: 'credito',
  debit_card: 'debito',
  account_money: 'pix',
};

const ok = () => new Response('ok', { status: 200 });
const falhar = (motivo: string, detalhe?: unknown) => {
  console.error(motivo, detalhe ?? '');
  // 500 de propósito: o Mercado Pago reenvia, e é isso que queremos quando não
  // conseguimos processar.
  return new Response('erro', { status: 500 });
};

async function rpc(nome: string, corpo: unknown): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
}

/** Reais para centavos, sem passar por ponto flutuante na conta final. */
const centavos = (reais: unknown): number =>
  Math.round(Number(reais ?? 0) * 100);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  if (!SUPABASE_URL || !SERVICE_ROLE || !MP_TOKEN_KEY) {
    return falhar('webhook sem configuração completa');
  }

  const url = new URL(req.url);
  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    // O Mercado Pago também avisa por query string em integrações antigas.
  }

  // O tipo pode vir no corpo (`type`) ou na query (`topic`).
  const tipo = String(corpo.type ?? corpo.topic ?? url.searchParams.get('type')
    ?? url.searchParams.get('topic') ?? '');

  // `merchant_order` e outros avisos não interessam: quem move dinheiro é o
  // pagamento. Devolver 200 faz o provedor parar de reenviar o que é ruído.
  if (tipo !== 'payment') return ok();

  const dados = (corpo.data ?? {}) as { id?: unknown };
  const pagamentoId = String(dados.id ?? corpo['data.id'] ?? url.searchParams.get('id') ?? '');
  if (!pagamentoId) return falhar('aviso de pagamento sem id', corpo);

  const mpUserId = String(corpo.user_id ?? url.searchParams.get('user_id') ?? '');
  if (!mpUserId) return falhar('aviso sem user_id — não dá para saber de qual guia é', corpo);

  // ---------------------------------------------------------------------------
  // 1. O token do guia dono da conta.
  // ---------------------------------------------------------------------------
  const rGuia = await rpc('guia_por_mp_user', { p_mp_user_id: mpUserId, p_chave: MP_TOKEN_KEY });
  if (!rGuia.ok) return falhar('não consegui buscar o guia', await rGuia.text());

  const guias = (await rGuia.json()) as Array<{ guide_id: string; mp_access_token: string }>;
  const guia = guias[0];
  if (!guia) return falhar(`nenhum guia conectado com a conta ${mpUserId}`);

  // ---------------------------------------------------------------------------
  // 2. O pagamento, lido da fonte. É aqui que um aviso forjado morre.
  // ---------------------------------------------------------------------------
  let pagamento: Record<string, unknown>;
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
      headers: { authorization: `Bearer ${guia.mp_access_token}` },
    });
    if (!r.ok) {
      // 404 aqui costuma ser aviso inventado, ou pagamento de outra conta.
      if (r.status === 404) {
        console.error(`pagamento ${pagamentoId} não existe na conta ${mpUserId}`);
        return ok(); // reenviar não vai fazer aparecer
      }
      return falhar(`Mercado Pago recusou a leitura do pagamento (${r.status})`);
    }
    pagamento = (await r.json()) as Record<string, unknown>;
  } catch (e) {
    return falhar('falha de rede ao ler o pagamento', e);
  }

  const referencia = String(pagamento.external_reference ?? '');
  const [bookingId, tipoCobranca] = referencia.split(':');
  if (!bookingId || !['sinal', 'saldo', 'integral'].includes(tipoCobranca ?? '')) {
    console.error(`pagamento ${pagamentoId} sem referência utilizável: "${referencia}"`);
    // Pagamento que não é de reserva nossa. Reenviar não resolve.
    return ok();
  }

  const statusMp = String(pagamento.status ?? '');
  const status = STATUS[statusMp] ?? 'pendente';
  const valor = centavos(pagamento.transaction_amount);
  const devolvido = centavos(
    (pagamento.transaction_amount_refunded as number | undefined) ?? 0,
  );
  const fee = centavos(
    (pagamento.marketplace_fee as number | undefined)
    ?? (pagamento.application_fee as number | undefined)
    ?? 0,
  );
  const metodo = METODO[String(pagamento.payment_method_id ?? '')]
    ?? METODO[String(pagamento.payment_type_id ?? '')]
    ?? null;

  // ---------------------------------------------------------------------------
  // 3. Registrar. A regra — idempotência, conferência de valor, extrato — está
  //    no banco, testada em CI. Aqui só se entrega o que foi lido.
  // ---------------------------------------------------------------------------
  const rReg = await rpc('registrar_pagamento', {
    p_booking_id: bookingId,
    p_tipo: tipoCobranca,
    p_provider_payment_id: pagamentoId,
    p_metodo: metodo,
    p_valor_centavos: valor,
    p_fee_centavos: fee,
    p_status: status,
    p_payload: pagamento,
  });

  if (!rReg.ok) {
    const detalhe = await rReg.text();
    // Valor que não bate é defeito nosso ou tentativa de fraude, e reenviar não
    // conserta — mas precisa gritar no registro para alguém olhar.
    if (detalhe.includes('não corresponde')) {
      console.error('VALOR DIVERGENTE no pagamento', pagamentoId, detalhe);
      return ok();
    }
    return falhar('banco recusou o registro do pagamento', detalhe);
  }

  // ---------------------------------------------------------------------------
  // 4. Devolução, quando houver.
  // ---------------------------------------------------------------------------
  if (devolvido > 0) {
    const rEst = await rpc('registrar_estorno', {
      p_provider_payment_id: pagamentoId,
      p_total_estornado_centavos: devolvido,
    });
    if (!rEst.ok) return falhar('banco recusou o estorno', await rEst.text());
  }

  return ok();
});
