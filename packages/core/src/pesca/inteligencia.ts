/**
 * Fishing Intelligence Engine.
 *
 * Junta astronomia, maré, índice e espécies e produz o que a tela mostra: a
 * nota do momento, o resumo em português, a linha do tempo do dia, os alertas
 * e a recomendação.
 *
 * TUDO AQUI É DERIVADO. Este arquivo não busca nada e não guarda nada: recebe a
 * série de ambientes já pronta e devolve leitura. É o que permite testá-lo sem
 * rede e reaproveitá-lo tanto na tela de hoje quanto na de sete dias.
 *
 * O RESUMO É MONTADO, NÃO SORTEADO. Cada frase sai de um fato que está nos
 * dados. Texto genérico do tipo "as condições estão favoráveis" seria pior que
 * não ter resumo: ensina o pescador a ignorar a tela.
 */

import { luaDoDia, solDoDia, type Lua, type Sol } from './astro.ts';
import { estadoDaMare, eventosDeMare, type EstadoDaMare, type EventoDeMare, type PontoDeNivel } from './mare.ts';
import { favorabilidade, type Favorabilidade } from './especies.ts';
import { indiceDePesca, type Indice } from './score.ts';
import { dec, estadoDoMar, NOME_DO_MAR, rumo, type Ambiente, type Local } from './tipos.ts';

export type NivelDeAlerta = 'aviso' | 'perigo';

export interface Alerta {
  chave: string;
  nivel: NivelDeAlerta;
  texto: string;
}

export interface Hora {
  instante: Date;
  indice: Indice;
}

export interface Janela {
  inicio: Date;
  fim: Date;
  notaMedia: number;
}

export interface AtividadeDosPeixes {
  nivel: 'muito_alta' | 'alta' | 'media' | 'baixa' | 'muito_baixa';
  rotulo: string;
}

export interface LeituraDoDia {
  local: Local;
  dia: Date;
  sol: Sol;
  lua: Lua;
  mares: EventoDeMare[];
  /** Estado da maré no instante de referência (agora, ou o meio-dia do dia futuro). */
  mare: EstadoDaMare | null;
  agora: Ambiente | null;
  indice: Indice;
  horas: Hora[];
  melhorJanela: Janela | null;
  atividade: AtividadeDosPeixes;
  especies: Favorabilidade[];
  alertas: Alerta[];
  resumo: string;
  recomendacao: string;
}

const ATIVIDADE: Array<[number, AtividadeDosPeixes]> = [
  [80, { nivel: 'muito_alta', rotulo: 'Muito alta' }],
  [65, { nivel: 'alta', rotulo: 'Alta' }],
  [45, { nivel: 'media', rotulo: 'Média' }],
  [28, { nivel: 'baixa', rotulo: 'Baixa' }],
  [0, { nivel: 'muito_baixa', rotulo: 'Muito baixa' }],
];

function alertasDe(a: Ambiente | null, mares: EventoDeMare[]): Alerta[] {
  if (!a) return [];
  const lista: Alerta[] = [];
  const põe = (chave: string, nivel: NivelDeAlerta, texto: string) =>
    lista.push({ chave, nivel, texto });

  if (a.trovoada) põe('trovoada', 'perigo', 'Trovoada prevista — risco de raio no mar aberto');
  if (a.ventoNos !== null && a.ventoNos >= 25) põe('vento', 'perigo', `Vento de ${dec(a.ventoNos, 0)} nós`);
  else if (a.ventoNos !== null && a.ventoNos >= 20) põe('vento', 'aviso', `Vento acima de 20 nós (${dec(a.ventoNos, 0)})`);
  if (a.rajadaNos !== null && a.ventoNos !== null && a.rajadaNos >= a.ventoNos + 12) {
    põe('rajada', 'aviso', `Rajadas de ${dec(a.rajadaNos, 0)} nós — bem acima do vento médio`);
  }
  if (a.ondaM !== null && a.ondaM >= 2.5) põe('onda', 'perigo', `Ondas de ${dec(a.ondaM, 1)} m`);
  else if (a.ondaM !== null && a.ondaM >= 2) põe('onda', 'aviso', `Ondas de ${dec(a.ondaM, 1)} m — mar agitado`);
  if (a.ondaM !== null && a.ondaPeriodoS !== null && a.ondaM >= 1.5 && a.ondaPeriodoS < 6) {
    põe('onda_curta', 'aviso', 'Onda curta e alta — batida desconfortável');
  }
  if (a.correnteNos !== null && a.correnteNos >= 1.5) põe('corrente', 'aviso', `Corrente forte (${dec(a.correnteNos, 1)} nós)`);
  if (a.visibilidadeKm !== null && a.visibilidadeKm < 1) põe('neblina', 'perigo', 'Visibilidade abaixo de 1 km — neblina densa');
  else if (a.visibilidadeKm !== null && a.visibilidadeKm < 3) põe('neblina', 'aviso', 'Visibilidade reduzida');
  if (a.chuvaMm !== null && a.chuvaMm >= 10) põe('chuva', 'aviso', `Chuva forte prevista (${dec(a.chuvaMm, 0)} mm)`);
  if (a.uv !== null && a.uv >= 11) põe('uv', 'perigo', `Índice UV extremo (${dec(a.uv, 0)})`);
  else if (a.uv !== null && a.uv >= 8) põe('uv', 'aviso', `Índice UV muito alto (${dec(a.uv, 0)})`);

  // Sizígia forte muda o planejamento do dia inteiro, e não é "perigo".
  const amplitudes = mares.slice(1).map((m, i) => Math.abs(m.alturaM - mares[i].alturaM));
  if (amplitudes.length && Math.max(...amplitudes) > 1.4) {
    põe('mare_grande', 'aviso', 'Maré de grande amplitude — correnteza forte nos canais');
  }

  return lista.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === 'perigo' ? -1 : 1));
}

/** A melhor sequência de horas seguidas do dia. */
function melhorJanelaDe(horas: Hora[]): Janela | null {
  if (horas.length < 2) return null;
  const largura = Math.min(3, horas.length);
  let melhor: Janela | null = null;

  for (let i = 0; i + largura <= horas.length; i += 1) {
    const trecho = horas.slice(i, i + largura);
    const media = trecho.reduce((s, h) => s + h.indice.nota, 0) / largura;
    if (!melhor || media > melhor.notaMedia) {
      melhor = {
        inicio: trecho[0].instante,
        fim: new Date(trecho[trecho.length - 1].instante.getTime() + 3_600_000),
        notaMedia: Math.round(media),
      };
    }
  }
  return melhor;
}

const hhmm = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });

function resumoDe(
  local: Local,
  a: Ambiente | null,
  indice: Indice,
  janela: Janela | null,
  mare: EstadoDaMare | null,
  especies: Favorabilidade[],
): string {
  if (!a) return 'Ainda não recebi as condições deste ponto.';

  const frases: string[] = [];

  const boas = especies.filter((f) => f.estrelas >= 4).slice(0, 2).map((f) => f.especie.nome.toLowerCase());
  frases.push(
    boas.length
      ? `${indice.rotulo} — principalmente para ${boas.join(' e ')}.`
      : `${indice.rotulo}.`,
  );

  if (a.ventoNos !== null) {
    const direcao = a.ventoDirecao !== null ? ` de ${rumo(a.ventoDirecao)}` : '';
    frases.push(
      a.ventoNos < 10
        ? `Vento fraco${direcao}, abaixo de 10 nós.`
        : `Vento${direcao} de ${dec(a.ventoNos, 0)} nós.`,
    );
  }

  if (a.pressaoHpa !== null) {
    const t = a.tendenciaPressao;
    frases.push(
      `Pressão em ${dec(a.pressaoHpa, 0)} hPa${
        t === 'caindo' ? ' e caindo, o que costuma abrir o apetite'
        : t === 'subindo' ? ' e subindo, típico do pós-frente'
        : t === 'estavel' ? ' e estável' : ''}.`,
    );
  }

  if (local.agua === 'salgada' && a.ondaM !== null) {
    frases.push(`Mar ${NOME_DO_MAR[estadoDoMar(a.ondaM)].toLowerCase()}, ${dec(a.ondaM, 1)} m.`);
  }

  if (mare?.proximo) {
    frases.push(
      `Maré ${mare.movimento}, com ${mare.proximo.tipo === 'preamar' ? 'preamar' : 'baixa-mar'} às ${hhmm(mare.proximo.instante)}.`,
    );
  }

  if (janela) frases.push(`O pico deve ficar entre ${hhmm(janela.inicio)} e ${hhmm(janela.fim)}.`);

  return frases.join(' ');
}

function recomendacaoDe(
  local: Local,
  indice: Indice,
  especies: Favorabilidade[],
  janela: Janela | null,
  alertas: Alerta[],
): string {
  const perigo = alertas.find((a) => a.nivel === 'perigo');
  if (perigo) {
    return `Hoje a recomendação é não sair: ${perigo.texto.toLowerCase()}. Nenhuma pescaria compensa o risco — remarque para outro dia.`;
  }

  const melhor = especies[0];
  if (!melhor || indice.nota < 30) {
    const pior = indice.fatores[0];
    return `Dia fraco para pescar${pior ? `, principalmente por causa de ${pior.nome.toLowerCase()} (${pior.explicacao})` : ''}. Se for sair, ajuste a expectativa.`;
  }

  const partes = [
    `Melhor aposta do dia: ${melhor.especie.nome.toLowerCase()}, ${melhor.especie.onde}.`,
  ];
  if (janela) partes.push(`Concentre o esforço entre ${hhmm(janela.inicio)} e ${hhmm(janela.fim)}.`);
  partes.push(`Isca indicada: ${melhor.especie.isca}.`);
  if (local.agua === 'salgada' && melhor.especie.dependeDaMare > 0.7) {
    partes.push('Procure trabalhar com a água correndo, e não na estofa.');
  }
  return partes.join(' ');
}

export interface EntradaDoDia {
  local: Local;
  /** Série horária do dia, já normalizada pelo provedor. */
  horas: Ambiente[];
  /** Série de nível do mar do período. Vazia em água doce. */
  nivelDoMar?: PontoDeNivel[];
  /** Instante de referência. Para hoje, agora; para um dia futuro, o meio-dia. */
  referencia: Date;
}

/**
 * A leitura completa de um dia num ponto.
 *
 * É a única função que a tela precisa chamar por dia — tudo o que ela mostra
 * sai daqui, calculado do mesmo conjunto de dados. Isso evita a classe de bug
 * em que o cartão do topo diz "excelente" e a linha do tempo mostra tudo baixo.
 */
export function lerODia(e: EntradaDoDia): LeituraDoDia {
  const { local, horas: serie, referencia } = e;
  const nivel = local.agua === 'salgada' ? (e.nivelDoMar ?? []) : [];

  const sol = solDoDia(referencia, local.lat, local.lng);
  const lua = luaDoDia(referencia, local.lat, local.lng);
  const mares = eventosDeMare(nivel);
  const mare = estadoDaMare(nivel, referencia, mares);

  const horas: Hora[] = serie.map((ambiente) => ({
    instante: ambiente.instante,
    indice: indiceDePesca({
      ambiente,
      agua: local.agua,
      sol,
      lua,
      mare: estadoDaMare(nivel, ambiente.instante, mares),
    }),
  }));

  // O "agora" é a hora da série mais próxima da referência. Pegar a primeira
  // hora do dia mostraria a madrugada para quem abre o aplicativo à tarde.
  const agora =
    serie.length === 0
      ? null
      : serie.reduce((melhor, c) =>
          Math.abs(c.instante.getTime() - referencia.getTime()) <
          Math.abs(melhor.instante.getTime() - referencia.getTime())
            ? c
            : melhor,
        );

  const indice = indiceDePesca({ ambiente: agora ?? { ...serieVazia(referencia) }, agua: local.agua, sol, lua, mare });
  const especies = favorabilidade({
    ambiente: agora ?? serieVazia(referencia),
    agua: local.agua, sol, lua, mare, indiceGeral: indice.nota,
  });
  const alertas = alertasDe(agora, mares);
  const melhorJanela = melhorJanelaDe(horas);

  return {
    local,
    dia: referencia,
    sol,
    lua,
    mares,
    mare,
    agora,
    indice,
    horas,
    melhorJanela,
    atividade: ATIVIDADE.find(([min]) => indice.nota >= min)?.[1] ?? ATIVIDADE[ATIVIDADE.length - 1][1],
    especies,
    alertas,
    resumo: resumoDe(local, agora, indice, melhorJanela, mare, especies),
    recomendacao: recomendacaoDe(local, indice, especies, melhorJanela, alertas),
  };
}

function serieVazia(instante: Date): Ambiente {
  return {
    instante,
    temperaturaC: null, sensacaoC: null, umidade: null, pressaoHpa: null,
    tendenciaPressao: null, ventoNos: null, rajadaNos: null, ventoDirecao: null,
    nuvens: null, uv: null, visibilidadeKm: null, chanceChuva: null, chuvaMm: null,
    trovoada: null, ondaM: null, ondaPeriodoS: null, ondaDirecao: null,
    aguaC: null, correnteNos: null, correnteDirecao: null, nivelMarM: null,
  };
}
