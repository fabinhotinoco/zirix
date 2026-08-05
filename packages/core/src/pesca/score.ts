/**
 * Índice de Pesca: de tudo o que está acontecendo, um número de 0 a 100.
 *
 * COMO ELE É CONSTRUÍDO, E POR QUE ASSIM.
 *
 * Cada fator vira uma nota de 0 a 100 e tem um peso. O índice é a média
 * ponderada — mas só do que existe. Fator sem dado sai da conta e os pesos são
 * renormalizados, em vez de contar como zero.
 *
 * Isso importa mais do que parece: provedor de previsão falha em pedaços. Se a
 * altura da onda não vier e ela contasse zero, um dia perfeito viraria "ruim
 * para pesca" — e o pescador ficaria em casa por causa de um campo faltando.
 *
 * A ÁGUA MUDA OS PESOS, NÃO AS REGRAS. Vento e pressão pesam nos dois lugares.
 * Onda e maré só existem no mar, e no lugar delas a represa dá mais peso à lua
 * e ao horário. É a mesma máquina com a tabela trocada.
 *
 * HONESTIDADE SOBRE O QUE ISTO É. Não é modelo validado contra captura real —
 * ninguém tem essa base ainda. É a codificação do que pescador experiente já
 * usa para decidir: pressão, movimento de água, luz e vento. Quando houver
 * histórico de capturas na plataforma, os pesos passam a ter de onde sair.
 */

import { dec, type Ambiente, type TipoDeAgua } from './tipos.ts';
import type { EstadoDaMare } from './mare.ts';
import type { Lua, Sol } from './astro.ts';

export interface Fator {
  chave: string;
  nome: string;
  nota: number;
  peso: number;
  /** O que essa nota quer dizer, em uma linha, para a tela explicar o índice. */
  explicacao: string;
}

export interface Indice {
  /** 0 a 100. */
  nota: number;
  estrelas: 1 | 2 | 3 | 4 | 5;
  rotulo: string;
  fatores: Fator[];
}

export interface Entrada {
  ambiente: Ambiente;
  agua: TipoDeAgua;
  sol: Sol;
  lua: Lua;
  mare: EstadoDaMare | null;
}

/** Interpola uma nota a partir de pontos de controle (x crescente). */
function curva(valor: number, pontos: Array<[number, number]>): number {
  if (valor <= pontos[0][0]) return pontos[0][1];
  const ultimo = pontos[pontos.length - 1];
  if (valor >= ultimo[0]) return ultimo[1];
  for (let i = 1; i < pontos.length; i += 1) {
    const [x1, y1] = pontos[i];
    if (valor > x1) continue;
    const [x0, y0] = pontos[i - 1];
    return y0 + ((y1 - y0) * (valor - x0)) / (x1 - x0);
  }
  return ultimo[1];
}

const PESOS: Record<TipoDeAgua, Record<string, number>> = {
  // No mar, água correndo e mar navegável mandam. Maré é o fator isolado que
  // mais muda o resultado de uma saída.
  salgada: {
    mare: 22, vento: 18, onda: 16, pressao: 14, horario: 12,
    lua: 8, nuvens: 4, chuva: 4, agua: 2,
  },
  // Na represa não há maré nem ondulação. O que sobra ganha o peso: pressão e
  // horário passam a decidir, e a lua pesa mais porque a atividade noturna e de
  // amanhecer é o que resta de ritmo.
  doce: {
    pressao: 24, horario: 20, vento: 16, lua: 14,
    nuvens: 10, chuva: 8, agua: 8,
  },
};

/** Distância em minutos até a janela de luz mais próxima (nascer ou pôr). */
function minutosAteALuz(instante: Date, sol: Sol): number | null {
  const alvos = [sol.nascer, sol.por].filter((d): d is Date => d !== null);
  if (alvos.length === 0) return null;
  return Math.min(...alvos.map((a) => Math.abs(a.getTime() - instante.getTime()) / 60_000));
}

function fatoresDe(e: Entrada): Fator[] {
  const { ambiente: a, sol, lua, mare } = e;
  const pesos = PESOS[e.agua];
  const fatores: Fator[] = [];
  const põe = (chave: string, nome: string, nota: number, explicacao: string) => {
    const peso = pesos[chave];
    if (peso === undefined) return; // fator que não existe nesta água
    fatores.push({ chave, nome, nota: Math.max(0, Math.min(100, nota)), peso, explicacao });
  };

  // --- pressão: o fator mais citado por quem pesca há muito tempo ------------
  if (a.pressaoHpa !== null) {
    // Alta e estável é o clássico. Muito baixa costuma vir com frente e mar ruim.
    let nota = curva(a.pressaoHpa, [
      [995, 25], [1005, 55], [1013, 80], [1020, 90], [1028, 70], [1035, 45],
    ]);
    let texto = `${dec(a.pressaoHpa, 0)} hPa`;
    if (a.tendenciaPressao === 'caindo') {
      // Peixe come ANTES da frente chegar. Queda lenta é a melhor janela que
      // existe — e é contraintuitivo para quem só olha "tempo bom".
      nota = Math.min(100, nota + 12);
      texto += ', caindo — costuma abrir o apetite antes da frente';
    } else if (a.tendenciaPressao === 'subindo') {
      // Subida forte é o depois da frente: água revirada, peixe parado.
      nota = Math.max(0, nota - 15);
      texto += ', subindo — típico do dia seguinte à frente, peixe desconfiado';
    } else if (a.tendenciaPressao === 'estavel') {
      nota = Math.min(100, nota + 5);
      texto += ', estável';
    }
    põe('pressao', 'Pressão atmosférica', nota, texto);
  }

  // --- vento ----------------------------------------------------------------
  if (a.ventoNos !== null) {
    // Vento zero deixa a água parada e o peixe enxerga tudo. O ideal é a brisa
    // que quebra a superfície sem levantar mar.
    const nota = curva(a.ventoNos, [
      [0, 55], [4, 80], [8, 95], [12, 85], [16, 60], [20, 30], [25, 10], [30, 0],
    ]);
    põe('vento', 'Vento', nota,
      `${dec(a.ventoNos, 0)} nós${a.rajadaNos ? `, rajadas de ${dec(a.rajadaNos, 0)}` : ''}`);
  }

  // --- onda (só mar) --------------------------------------------------------
  if (a.ondaM !== null) {
    let nota = curva(a.ondaM, [
      [0, 85], [0.5, 95], [1, 80], [1.5, 60], [2, 35], [2.5, 15], [3.5, 0],
    ]);
    // Onda curta incomoda muito mais que onda longa da mesma altura: 1,5 m com
    // 12 s de período é navegável; com 5 s, é pancada.
    if (a.ondaPeriodoS !== null && a.ondaPeriodoS < 6 && a.ondaM > 1) nota -= 15;
    põe('onda', 'Ondas', nota,
      `${dec(a.ondaM, 1)} m${a.ondaPeriodoS ? ` a cada ${dec(a.ondaPeriodoS, 0)} s` : ''}`);
  }

  // --- maré (só mar) --------------------------------------------------------
  if (mare) {
    // A força já é a senoide entre extremos: 1 na meia-maré, 0 na estofa.
    const nota = 25 + mare.forca * 70;
    const texto =
      mare.movimento === 'parada'
        ? 'sem movimento definido'
        : `${mare.movimento}, ${mare.forca > 0.7 ? 'com água correndo forte' : mare.forca > 0.35 ? 'em movimento' : 'perto da estofa'}`;
    põe('mare', 'Maré', nota, texto);
  }

  // --- lua ------------------------------------------------------------------
  // Nova e cheia dão as marés de sizígia e as noites de maior atividade. Os
  // quartos são o vale do ciclo.
  const distanciaDaSizigia = Math.min(lua.fracao, Math.abs(0.5 - lua.fracao), 1 - lua.fracao);
  põe('lua', 'Fase da lua', curva(distanciaDaSizigia, [[0, 95], [0.1, 80], [0.25, 45]]),
    lua.fracao < 0.06 || lua.fracao > 0.94
      ? 'lua nova — maré de sizígia e noites escuras'
      : Math.abs(lua.fracao - 0.5) < 0.06
        ? 'lua cheia — maré de sizígia e noite clara'
        : `${dec(lua.iluminacao * 100, 0)}% iluminada`);

  // --- horário --------------------------------------------------------------
  const ateALuz = minutosAteALuz(a.instante, sol);
  if (ateALuz !== null) {
    põe('horario', 'Horário', curva(ateALuz, [[0, 100], [45, 90], [90, 70], [180, 45], [360, 25]]),
      ateALuz < 60 ? 'dentro da virada de luz' : `a ${Math.round(ateALuz / 60)} h da virada de luz`);
  }

  // --- nuvens ---------------------------------------------------------------
  if (a.nuvens !== null) {
    // Céu parcialmente encoberto é o melhor: sombra na água sem escuridão.
    põe('nuvens', 'Nebulosidade', curva(a.nuvens, [[0, 60], [30, 80], [60, 95], [90, 75], [100, 65]]),
      `${dec(a.nuvens, 0)}% de cobertura`);
  }

  // --- chuva ----------------------------------------------------------------
  if (a.chanceChuva !== null || a.chuvaMm !== null) {
    const mm = a.chuvaMm ?? 0;
    const chance = a.chanceChuva ?? 0;
    let nota = curva(mm, [[0, 85], [1, 90], [4, 65], [10, 35], [20, 10]]);
    if (chance > 70 && mm < 1) nota -= 10;
    if (a.trovoada) nota = 0;
    põe('chuva', 'Chuva', nota,
      a.trovoada ? 'trovoada prevista' : mm > 0 ? `${dec(mm, 1)} mm previstos` : `${dec(chance, 0)}% de chance`);
  }

  // --- temperatura da água --------------------------------------------------
  if (a.aguaC !== null) {
    // Faixa de conforto ampla; a preferência fina é por espécie, e mora em
    // `especies.ts`. Aqui só entram os extremos que param qualquer peixe.
    põe('agua', 'Temperatura da água', curva(a.aguaC, [[12, 25], [17, 65], [21, 90], [27, 90], [30, 60], [33, 25]]),
      `${dec(a.aguaC, 1)} °C`);
  }

  return fatores;
}

const ROTULOS: Array<[number, string]> = [
  [85, 'Excelente para pesca'],
  [70, 'Muito bom para pesca'],
  [55, 'Bom para pesca'],
  [40, 'Condições regulares'],
  [25, 'Ruim para pesca'],
  [0, 'Não vale a saída'],
];

/**
 * Teto de segurança.
 *
 * Média ponderada tem um defeito perigoso aqui: um amanhecer perfeito com maré
 * cheia enchendo consegue sustentar a nota de um dia com trovoada e 2,6 m de
 * mar. Saiu 34 no teste — "ruim", quando a resposta certa é "não saia".
 *
 * Nenhuma combinação de fatores bons compra a saída num dia desses. O teto
 * corta por cima da média, e é o menor de todos os que se aplicam.
 */
function tetoDeSeguranca(a: Ambiente): { teto: number; motivo: string } | null {
  const tetos: Array<{ teto: number; motivo: string }> = [];
  if (a.trovoada) tetos.push({ teto: 15, motivo: 'trovoada prevista' });
  if (a.ventoNos !== null && a.ventoNos >= 25) tetos.push({ teto: 20, motivo: 'vento forte' });
  else if (a.ventoNos !== null && a.ventoNos >= 20) tetos.push({ teto: 35, motivo: 'vento acima de 20 nós' });
  if (a.ondaM !== null && a.ondaM >= 2.5) tetos.push({ teto: 20, motivo: 'mar muito agitado' });
  else if (a.ondaM !== null && a.ondaM >= 2) tetos.push({ teto: 35, motivo: 'mar agitado' });
  if (tetos.length === 0) return null;
  return tetos.reduce((m, t) => (t.teto < m.teto ? t : m));
}

/**
 * O índice de um instante.
 *
 * Sem nenhum fator disponível devolve nota 0 e nenhum fator — a tela precisa
 * saber a diferença entre "está ruim" e "não sei", e é a lista vazia que conta
 * isso.
 */
export function indiceDePesca(entrada: Entrada): Indice {
  const fatores = fatoresDe(entrada);
  if (fatores.length === 0) {
    return { nota: 0, estrelas: 1, rotulo: 'Sem dados suficientes', fatores: [] };
  }

  const somaPesos = fatores.reduce((s, f) => s + f.peso, 0);
  const media = Math.round(fatores.reduce((s, f) => s + f.nota * f.peso, 0) / somaPesos);

  const limite = tetoDeSeguranca(entrada.ambiente);
  const nota = limite ? Math.min(media, limite.teto) : media;

  return {
    nota,
    estrelas: Math.max(1, Math.min(5, Math.ceil(nota / 20))) as 1 | 2 | 3 | 4 | 5,
    // Quando o teto age, ele é o que a pessoa precisa ler — não a média que a
    // maré e o amanhecer produziram.
    rotulo:
      limite && nota < media
        ? `Não vale a saída — ${limite.motivo}`
        : (ROTULOS.find(([min]) => nota >= min)?.[1] ?? 'Condições regulares'),
    fatores: [...fatores].sort((a, b) => b.peso * (100 - b.nota) - a.peso * (100 - a.nota)),
  };
}
