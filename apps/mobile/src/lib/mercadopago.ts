/**
 * Conexão da conta Mercado Pago do guia.
 *
 * O aplicativo faz duas coisas aqui, e nenhuma delas envolve dinheiro ou
 * segredo: pede ao banco um segredo de uso único e abre o navegador no
 * endereço de autorização do Mercado Pago. Todo o resto — trocar o código pelo
 * token, cifrar, gravar — acontece na função `mp-oauth`, no servidor.
 *
 * POR QUE O APLICATIVO NÃO ESPERA RESPOSTA DO NAVEGADOR.
 *
 * Seria possível abrir uma sessão de autenticação e ler o que ela devolve ao
 * fechar. Não fazemos isso: quem sabe se a conta foi conectada é o banco, não o
 * navegador. Navegador fechado à força, aba trocada, aplicativo mandado para
 * segundo plano — em todos esses casos a conexão pode ter dado certo e a
 * resposta não chega. A tela simplesmente pergunta ao banco de novo.
 *
 * Isso também evita uma dependência nativa a mais, e com ela uma nova compilação
 * pela Expo só para ler um valor em que não confiaríamos de qualquer jeito.
 */

import * as Linking from 'expo-linking';

import { config } from './config';
import { supabase } from './supabase';

/** Endereço para onde o Mercado Pago devolve o guia. */
export function enderecoDeRetorno(): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/mp-oauth`;
}

/**
 * Falta configuração para conectar?
 *
 * Devolve a explicação, ou null quando está tudo pronto. A tela usa isso para
 * dizer o que houve em vez de mostrar um botão que não faria nada.
 */
export function faltaConfiguracao(): string | null {
  if (!config.mpClientId) {
    return 'A conexão com o Mercado Pago ainda não foi configurada nesta versão do aplicativo. Avise a administração da plataforma.';
  }
  return null;
}

/**
 * Começa a conexão: pega o segredo de uso único e abre a autorização.
 *
 * O `state` é o que liga esta pessoa à volta do Mercado Pago. A requisição de
 * retorno chega ao servidor sem sessão nenhuma — é o navegador do guia vindo de
 * um site de terceiro —, e sem esse segredo qualquer um penduraria a própria
 * conta no cadastro de um guia.
 */
export async function conectarMercadoPago(): Promise<void> {
  const problema = faltaConfiguracao();
  if (problema) throw new Error(problema);

  const { data, error } = await supabase.rpc('iniciar_conexao_mp');
  if (error) throw error;

  const state = String(data ?? '');
  if (!state) throw new Error('O servidor não devolveu o código de conexão.');

  const endereco =
    'https://auth.mercadopago.com.br/authorization' +
    `?client_id=${encodeURIComponent(config.mpClientId)}` +
    '&response_type=code' +
    '&platform_id=mp' +
    `&redirect_uri=${encodeURIComponent(enderecoDeRetorno())}` +
    `&state=${encodeURIComponent(state)}`;

  await Linking.openURL(endereco);
}

/** Desfaz a conexão. A conta é do guia; ele pode retirá-la quando quiser. */
export async function desconectarMercadoPago(): Promise<void> {
  const { error } = await supabase.rpc('desconectar_mp');
  if (error) throw error;
}
