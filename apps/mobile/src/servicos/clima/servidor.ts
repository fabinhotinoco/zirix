/**
 * Previsão vinda do servidor da plataforma.
 *
 * O aplicativo NÃO fala mais direto com o Open-Meteo. Ele pede à função
 * `previsao`, que busca uma vez por hora e serve a todo mundo do banco.
 *
 * Três motivos, e o terceiro é o que decide:
 *
 * 1. **Custo.** Direto do celular, as chamadas crescem com o número de
 *    usuários. Pelo servidor, crescem com o número de PONTOS: um ponto custa 24
 *    chamadas por dia, tenha ele um pescador ou dez mil.
 * 2. **Velocidade.** O dado já está no banco quando a tela abre.
 * 3. **Troca de provedor.** Quem sabe falar com o Open-Meteo é a função no
 *    servidor. Trocar não encosta em nenhuma tela — e é uma decisão que ainda
 *    está em aberto, por causa da licença comercial.
 *
 * A TRADUÇÃO do JSON continua acontecendo aqui, e não no servidor, porque ela
 * mora no núcleo (`@pescavertical/core/pesca/openmeteo`), é testada lá, e é a
 * mesma para qualquer origem do dado.
 */

import { traduzirOpenMeteo, type RespostaOpenMeteo } from '@pescavertical/core/pesca/openmeteo';
import type { Local } from '@pescavertical/core/pesca/tipos';

import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type { PrevisaoBruta, ProvedorDeClima } from './provedor';

interface RespostaDoServidor {
  dados?: { tempo: RespostaOpenMeteo | null; mar: RespostaOpenMeteo | null };
  temDadosDeMar?: boolean;
  fonte?: string;
  buscadoEm?: string;
  doCache?: boolean;
  vencido?: boolean;
  erro?: string;
}

export const previsaoDoServidor: ProvedorDeClima = {
  nome: 'Open-Meteo (pelo servidor)',

  async buscar(local: Pick<Local, 'lat' | 'lng'>): Promise<PrevisaoBruta> {
    const base = config.supabaseUrl.replace(/\/+$/, '');
    const endereco = `${base}/functions/v1/previsao`
      + `?lat=${local.lat.toFixed(4)}&lng=${local.lng.toFixed(4)}`;

    // A função exige quem está logado. Sem o token, ela seria um proxy de
    // previsão de graça para o mundo, pago pela cota da plataforma.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Faça login para ver as condições de pesca.');

    const r = await fetch(endereco, {
      headers: { authorization: `Bearer ${token}`, apikey: config.supabaseKey },
    });

    const corpo = (await r.json().catch(() => ({}))) as RespostaDoServidor;

    if (!r.ok || !corpo.dados) {
      throw new Error(corpo.erro ?? 'Não consegui buscar a previsão agora.');
    }

    const { horas, nivelDoMar, temDadosDeMar } = traduzirOpenMeteo(
      corpo.dados.tempo ?? null,
      corpo.dados.mar ?? null,
    );

    return {
      horas,
      nivelDoMar,
      // A data de busca é a do SERVIDOR, não a de agora: é ela que diz de
      // quando é a previsão, e é o que a tela mostra quando o dado está velho.
      buscadoEm: corpo.buscadoEm ? new Date(corpo.buscadoEm) : new Date(),
      fonte: corpo.fonte ?? 'Open-Meteo',
      temDadosDeMar: corpo.temDadosDeMar ?? temDadosDeMar,
    };
  },
};
