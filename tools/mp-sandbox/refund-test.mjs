// Passo 3 do teste: estorno PARCIAL, simulando a política de cancelamento.
//
//   node refund-test.mjs <payment_id> <percentual_de_retencao>
//   ex.: node refund-test.mjs 1234567890 50     → retém 50%, devolve 50%
//
// O que este teste precisa provar:
//   1. O estorno parcial é aceito num pagamento com application_fee.
//   2. A devolução sai PROPORCIONALMENTE da conta do guia e da comissão —
//      se não sair, a plataforma fica devendo e o cálculo do reembolso
//      precisa ser feito à mão no nosso lado.
//
// O item 2 é a razão de existir deste script. Confira o extrato das duas
// contas depois de rodar.

import { randomUUID } from 'node:crypto';
import { carregarEnv, exigir, mp, brl } from './lib.mjs';

carregarEnv();

const paymentId = process.argv[2] ?? process.env.MP_PAYMENT_ID;
const retencaoPct = Number(process.argv[3] ?? 50);

if (!paymentId) {
  console.error('Uso: node refund-test.mjs <payment_id> <percentual_de_retencao>');
  process.exit(1);
}

const tokenGuia = exigir('MP_GUIA_ACCESS_TOKEN');

const antes = await mp(`/v1/payments/${paymentId}`, { token: tokenGuia });
const pagoCentavos = Math.round(antes.transaction_amount * 100);
const feeCentavos = Math.round((antes.application_fee ?? 0) * 100);

// Regra do planejamento: a retenção nunca supera o que foi efetivamente pago.
const retencao = Math.min(Math.round((pagoCentavos * retencaoPct) / 100), pagoCentavos);
const devolver = pagoCentavos - retencao;

console.log('\n── Cancelamento simulado ────────────────────────────');
console.log(`  Pagamento        ${paymentId}  (${antes.status})`);
console.log(`  Valor pago       ${brl(pagoCentavos)}`);
console.log(`  Comissão retida  ${brl(feeCentavos)}`);
console.log(`  Retenção (${retencaoPct}%)  ${brl(retencao)}`);
console.log(`  A devolver       ${brl(devolver)}`);
console.log('─────────────────────────────────────────────────────\n');

if (devolver <= 0) {
  console.log('Retenção de 100%: nada a estornar. Nada a testar aqui.\n');
  process.exit(0);
}

const estorno = await mp(`/v1/payments/${paymentId}/refunds`, {
  metodo: 'POST',
  token: tokenGuia,
  idempotencia: randomUUID(),
  corpo: { amount: Number((devolver / 100).toFixed(2)) },
});

console.log(`✓ Estorno criado — refund_id ${estorno.id}  (status: ${estorno.status})`);
console.log(`  Valor estornado: ${brl(Math.round(estorno.amount * 100))}\n`);

const depois = await mp(`/v1/payments/${paymentId}`, { token: tokenGuia });
const totalEstornado = Math.round((depois.transaction_amount_refunded ?? 0) * 100);

console.log('── Situação do pagamento ────────────────────────────');
console.log(`  status            ${depois.status}`);
console.log(`  total estornado   ${brl(totalEstornado)}`);
console.log(`  restante retido   ${brl(pagoCentavos - totalEstornado)}`);
console.log('─────────────────────────────────────────────────────\n');

const comissaoEsperada = Math.round((feeCentavos * (pagoCentavos - totalEstornado)) / pagoCentavos);
console.log('O QUE CONFERIR NO EXTRATO DAS DUAS CONTAS:\n');
console.log(`  • Se o rateio for proporcional, a comissão que sobra na sua conta`);
console.log(`    deve ser aproximadamente ${brl(comissaoEsperada)}.`);
console.log(`  • Se a comissão NÃO for reduzida no estorno, o valor devolvido saiu`);
console.log(`    inteiro da conta do guia — e o cálculo do reembolso precisa`);
console.log(`    compensar isso no nosso lado. Anote o resultado real.\n`);
console.log('Resposta completa do estorno, para registro:\n');
console.log(JSON.stringify(estorno, null, 2));
