// Passo 2 do teste: cobrar o SINAL por Pix, em nome do guia, retendo a comissão.
//
//   node split-test.mjs
//
// Simula a reserva do planejamento: passeio de R$ 1.000, comissão 10%, sinal 30%.
// Cria a cobrança do sinal (R$ 300) com application_fee de R$ 30 e fica
// aguardando o pagamento do QR Code.

import { randomUUID } from 'node:crypto';
import { carregarEnv, exigir, mp, brl, ratearComissao, espera, instalarTratamentoDeErro } from './lib.mjs';

instalarTratamentoDeErro();
carregarEnv();

const VALOR_TOTAL = Number(process.env.VALOR_TOTAL_CENTAVOS ?? 100000); // R$ 1.000,00
const COMISSAO_PCT = Number(process.env.COMISSAO_PERCENTUAL ?? 10);
const SINAL_PCT = Number(process.env.SINAL_PERCENTUAL ?? 30);

const comissao = Math.round((VALOR_TOTAL * COMISSAO_PCT) / 100);
const sinal = Math.round((VALOR_TOTAL * SINAL_PCT) / 100);
const saldo = VALOR_TOTAL - sinal;
const [feeSinal, feeSaldo] = ratearComissao(VALOR_TOTAL, comissao, [sinal, saldo]);

console.log('\n── Simulação da reserva ─────────────────────────────');
console.log(`  Valor total   ${brl(VALOR_TOTAL)}`);
console.log(`  Comissão      ${brl(comissao)}  (${COMISSAO_PCT}%)`);
console.log(`  Sinal         ${brl(sinal)}  → comissão ${brl(feeSinal)} / guia ${brl(sinal - feeSinal)}`);
console.log(`  Quitação      ${brl(saldo)}  → comissão ${brl(feeSaldo)} / guia ${brl(saldo - feeSaldo)}`);
console.log(`  Soma das taxas ${brl(feeSinal + feeSaldo)}  ${feeSinal + feeSaldo === comissao ? '✓ bate com a comissão' : '✗ NÃO BATE'}`);
console.log('─────────────────────────────────────────────────────\n');

const tokenGuia = exigir('MP_GUIA_ACCESS_TOKEN');
const referencia = `TESTE-${Date.now()}`;

const pagamento = await mp('/v1/payments', {
  metodo: 'POST',
  token: tokenGuia,
  idempotencia: randomUUID(),
  corpo: {
    transaction_amount: Number((sinal / 100).toFixed(2)),
    description: 'Sinal - pescaria de teste',
    payment_method_id: 'pix',
    external_reference: referencia,
    // A comissão da plataforma, retida na origem.
    // Em /v1/payments o campo é application_fee.
    // (No Checkout Pro, o equivalente na preference chama-se marketplace_fee.)
    application_fee: Number((feeSinal / 100).toFixed(2)),
    payer: {
      email: process.env.MP_EMAIL_COMPRADOR ?? 'test_user_comprador@testuser.com',
      first_name: 'Pescador',
      last_name: 'Teste',
      identification: {
        type: 'CPF',
        number: process.env.MP_CPF_COMPRADOR ?? '19119119100',
      },
    },
    ...(process.env.MP_NOTIFICATION_URL ? { notification_url: process.env.MP_NOTIFICATION_URL } : {}),
  },
});

const tx = pagamento.point_of_interaction?.transaction_data;

console.log(`✓ Cobrança criada — payment_id ${pagamento.id}  (status: ${pagamento.status})`);
console.log(`  external_reference: ${referencia}`);
console.log(`  application_fee informado: ${pagamento.application_fee ?? '(não retornado)'}\n`);

if (tx?.qr_code) {
  console.log('── Pix copia e cola ─────────────────────────────────');
  console.log(tx.qr_code);
  console.log('─────────────────────────────────────────────────────');
  if (tx.ticket_url) console.log(`\nOu abra: ${tx.ticket_url}`);
} else {
  console.log('⚠ A resposta não trouxe QR Code. Resposta completa:');
  console.log(JSON.stringify(pagamento, null, 2));
}

console.log(`\nGuarde para o teste de estorno:  MP_PAYMENT_ID=${pagamento.id}\n`);
console.log('Aguardando pagamento (Ctrl+C para sair)...\n');

let anterior = pagamento.status;
for (let i = 0; i < 120; i++) {
  await espera(5000);
  const atual = await mp(`/v1/payments/${pagamento.id}`, { token: tokenGuia });
  if (atual.status !== anterior) {
    console.log(`  status: ${anterior} → ${atual.status}`);
    anterior = atual.status;
  }
  if (atual.status === 'approved') {
    const liquido = atual.transaction_details?.net_received_amount;
    console.log('\n✓ Pagamento aprovado.\n');
    console.log(`  Valor pago            ${brl(Math.round(atual.transaction_amount * 100))}`);
    console.log(`  Comissão da plataforma ${brl(Math.round((atual.application_fee ?? 0) * 100))}`);
    console.log(`  Líquido do guia        ${liquido != null ? brl(Math.round(liquido * 100)) : '(ver extrato)'}`);
    console.log('\nConfira agora nas DUAS contas do Mercado Pago:');
    console.log('  • conta do guia      → deve ter recebido o valor menos a comissão e menos a taxa do MP');
    console.log('  • conta da plataforma → deve ter recebido a comissão\n');
    break;
  }
  if (['rejected', 'cancelled'].includes(atual.status)) {
    console.log(`\n✗ Pagamento ${atual.status}.\n`);
    break;
  }
}
