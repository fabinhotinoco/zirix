/**
 * O que a tela de condições chama.
 *
 * Junta provedor, cache e o motor do núcleo, e devolve a leitura pronta de cada
 * dia. A tela não sabe de onde veio o dado nem quem calculou — o que permite
 * trocar o provedor sem tocar em nenhum componente.
 *
 * ORDEM DE ATENDIMENTO, e o motivo dela:
 *
 * 1. Cache fresco → devolve na hora.
 * 2. Cache vencido → **devolve mesmo assim** e busca por trás. A tela aparece
 *    preenchida em vez de piscar um esqueleto, e se atualiza sozinha quando a
 *    resposta chega.
 * 3. Nada em cache → busca e espera.
 * 4. Busca falhou mas havia cache → mostra o antigo, dizendo a idade.
 *
 * O passo 4 é o que faz a tela funcionar dentro do barco, sem sinal.
 */

import { lerODia, type LeituraDoDia } from '@pescavertical/core/pesca/inteligencia';
import type { Local, TipoDeAgua } from '@pescavertical/core/pesca/tipos';

import { chaveDoLocal, guardar, ler, VALIDADE_MS } from './cache';
import { previsaoDoServidor } from './servidor';
import type { PrevisaoBruta, ProvedorDeClima } from './provedor';

export const DIAS_DE_PREVISAO = 7;

let provedor: ProvedorDeClima = previsaoDoServidor;

/** Troca o provedor. Existe para os testes e para a migração futura. */
export function usarProvedor(p: ProvedorDeClima): void {
  provedor = p;
}

export interface Condicoes {
  local: Local;
  /** Um item por dia, começando hoje. */
  dias: LeituraDoDia[];
  fonte: string;
  /** Null quando os dados são frescos; caso contrário, a idade em minutos. */
  desatualizadoHaMinutos: number | null;
  /** Verdadeiro quando não deu para buscar e estamos mostrando o que havia. */
  offline: boolean;
}

/** Meia-noite local de um dia, a partir de qualquer instante dele. */
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function montar(local: Local, previsao: PrevisaoBruta, agora: Date): LeituraDoDia[] {
  const porDia = new Map<number, typeof previsao.horas>();
  for (const hora of previsao.horas) {
    const chave = inicioDoDia(hora.instante).getTime();
    const lista = porDia.get(chave) ?? [];
    lista.push(hora);
    porDia.set(chave, lista);
  }

  const hoje = inicioDoDia(agora).getTime();

  return [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chave, horas]) =>
      lerODia({
        local,
        horas,
        nivelDoMar: previsao.nivelDoMar,
        // Para hoje, o instante é agora — a tela precisa mostrar a condição do
        // momento. Para os outros dias, o meio-dia, que é o meio-termo honesto
        // entre a madrugada e a noite.
        referencia: chave === hoje ? agora : new Date(chave + 12 * 3_600_000),
      }),
    );
}

/**
 * Condições de um ponto.
 *
 * `agua` vem do cadastro quando existe; quando não, é descoberta pela cobertura
 * de dados marinhos do provedor. Um ponto que devolve altura de onda é mar; um
 * que não devolve é água interior. Isso evita pedir ao guia que classifique o
 * próprio ponto — e evita errar quando ele classificar errado.
 */
export async function condicoesDoLocal(
  entrada: { nome: string; lat: number; lng: number; agua?: TipoDeAgua },
  opcoes: { forcarBusca?: boolean } = {},
): Promise<Condicoes> {
  const chave = chaveDoLocal(entrada.lat, entrada.lng, DIAS_DE_PREVISAO);
  const guardado = opcoes.forcarBusca ? null : await ler(chave, VALIDADE_MS.forecast);

  const comLocal = (previsao: PrevisaoBruta, desatualizado: number | null, offline: boolean): Condicoes => {
    const local: Local = {
      nome: entrada.nome,
      lat: entrada.lat,
      lng: entrada.lng,
      agua: entrada.agua ?? (previsao.temDadosDeMar ? 'salgada' : 'doce'),
    };
    return {
      local,
      dias: montar(local, previsao, new Date()),
      fonte: previsao.fonte,
      desatualizadoHaMinutos: desatualizado,
      offline,
    };
  };

  if (guardado?.fresco) return comLocal(guardado.previsao, null, false);

  try {
    const previsao = await provedor.buscar(entrada, DIAS_DE_PREVISAO);
    void guardar(chave, previsao);
    return comLocal(previsao, null, false);
  } catch (e) {
    // Sem rede, o que estava guardado é melhor que uma tela vazia — desde que a
    // tela diga que é antigo. Esconder a idade seria pior que não mostrar nada.
    if (guardado) return comLocal(guardado.previsao, guardado.idadeMinutos, true);
    throw e;
  }
}
