// Utilitários compartilhados dos scripts de teste do Mercado Pago.
// Sem dependências: Node 18+ (fetch nativo).

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Lê o .env local sem depender de pacote externo. */
export function carregarEnv() {
  const caminho = join(AQUI, '.env');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual === -1) continue;
    const chave = limpa.slice(0, igual).trim();
    const valor = limpa.slice(igual + 1).trim().replace(/^["']|["']$/g, '');
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}

export function exigir(chave) {
  const valor = process.env[chave];
  if (!valor) {
    console.error(`\n✗ Falta a variável ${chave}. Preencha o arquivo tools/mp-sandbox/.env`);
    process.exit(1);
  }
  return valor;
}

export const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Chamada à API do Mercado Pago. Sempre devolve o corpo cru junto,
 * porque em teste de integração o que importa é ver a resposta real.
 */
export async function mp(caminho, { metodo = 'GET', token, corpo, idempotencia } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia || randomUUID();

  const resposta = await fetch(`https://api.mercadopago.com${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = { _naoJson: texto };
  }

  if (!resposta.ok) {
    console.error(`\n✗ ${metodo} ${caminho} → HTTP ${resposta.status}`);
    console.error(JSON.stringify(dados, null, 2));
    throw new Error(`Mercado Pago respondeu ${resposta.status}`);
  }
  return dados;
}

/**
 * Rateio da comissão entre as cobranças de uma reserva.
 * A última cobrança absorve o arredondamento, de modo que a soma
 * das taxas sempre bate exatamente com a comissão total.
 * Esta é a mesma regra descrita em docs/PLANEJAMENTO.md.
 */
export function ratearComissao(valorLiquidoCentavos, comissaoCentavos, cobrancasCentavos) {
  const soma = cobrancasCentavos.reduce((a, b) => a + b, 0);
  if (soma !== valorLiquidoCentavos) {
    throw new Error(
      `As cobranças (${soma}) não somam o valor líquido (${valorLiquidoCentavos}).`,
    );
  }
  const taxas = [];
  let acumulado = 0;
  for (let i = 0; i < cobrancasCentavos.length; i++) {
    if (i === cobrancasCentavos.length - 1) {
      taxas.push(comissaoCentavos - acumulado); // absorve o resto
    } else {
      const fatia = Math.round((comissaoCentavos * cobrancasCentavos[i]) / valorLiquidoCentavos);
      taxas.push(fatia);
      acumulado += fatia;
    }
  }
  return taxas;
}

export const espera = (ms) => new Promise((r) => setTimeout(r, ms));
