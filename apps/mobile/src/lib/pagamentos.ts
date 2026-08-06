/**
 * Pagamento de uma reserva.
 *
 * O aplicativo manda **duas coisas**: o id da reserva e o tipo da cobrança.
 * Nenhum valor sai daqui. Quem soma é o banco, lendo o que está congelado na
 * reserva desde que ela foi criada — se o preço viesse desta tela, bastaria um
 * `curl` com a chave publicável para pagar mil reais com um centavo.
 *
 * O QUE VOLTA é um endereço do Mercado Pago. O aplicativo abre e sai de cena.
 * Não há campo de cartão aqui, e isso é de propósito: número de cartão que não
 * passa pelo nosso código é número de cartão que não podemos vazar.
 *
 * QUEM CONFIRMA NÃO É ESTA TELA. É o webhook, no servidor. O pagamento pode ser
 * aprovado com o aplicativo fechado, com o celular sem bateria, com o navegador
 * derrubado no meio — e a reserva confirma do mesmo jeito. Por isso, ao voltar,
 * a tela apenas pergunta ao banco de novo. Nada do que o navegador devolve é
 * tratado como prova de pagamento.
 */

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { config } from './config';
import { supabase } from './supabase';

export type TipoDeCobranca = 'sinal' | 'saldo' | 'integral';

export interface Cobranca {
  url: string;
  valor_centavos: number;
  fee_centavos: number;
  preference_id: string | null;
}

/**
 * Pede a cobrança ao servidor.
 *
 * As mensagens de recusa vêm do banco escritas para a pessoa ler — "Esta
 * reserva já teve o sinal pago", "O guia desconectou a conta de recebimento".
 * São repassadas como estão, porque explicam melhor do que qualquer texto
 * genérico que eu escrevesse aqui.
 */
export async function pedirCobranca(
  bookingId: string,
  tipo: TipoDeCobranca,
): Promise<Cobranca> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Faça login para pagar.');

  const base = config.supabaseUrl.replace(/\/+$/, '');
  const r = await fetch(`${base}/functions/v1/cobrar`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: config.supabaseKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ booking_id: bookingId, tipo }),
  });

  const corpo = (await r.json().catch(() => ({}))) as Partial<Cobranca> & { erro?: string };

  if (!r.ok || !corpo.url) {
    throw new Error(corpo.erro ?? 'Não foi possível abrir o pagamento agora.');
  }

  return {
    url: corpo.url,
    valor_centavos: corpo.valor_centavos ?? 0,
    fee_centavos: corpo.fee_centavos ?? 0,
    preference_id: corpo.preference_id ?? null,
  };
}

/**
 * Abre o Mercado Pago.
 *
 * Na web vai na MESMA aba: o Mercado Pago devolve a pessoa para `/reservas`
 * quando termina, e aba nova quebraria essa volta — o pagador ficaria olhando
 * uma aba de sucesso enquanto a lista de reservas, atrás, continuaria velha.
 *
 * No celular abre o navegador do sistema. A volta não traz ninguém para dentro
 * do aplicativo, e não precisa: quem sabe se o pagamento entrou é o banco.
 */
export async function abrirPagamento(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // `location.assign` em vez de `Linking.openURL` porque este é o único jeito
    // de garantir a mesma aba em todos os navegadores.
    globalThis.location?.assign(url);
    return;
  }
  await Linking.openURL(url);
}

/** O caminho inteiro, para a tela não precisar encadear as duas. */
export async function pagar(bookingId: string, tipo: TipoDeCobranca): Promise<void> {
  const cobranca = await pedirCobranca(bookingId, tipo);
  await abrirPagamento(cobranca.url);
}
