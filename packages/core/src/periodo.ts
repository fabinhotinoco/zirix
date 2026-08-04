/**
 * Semana, mês e dia — as três formas de olhar a mesma agenda.
 *
 * Tudo aqui trabalha com texto 'aaaa-mm-dd', nunca com objeto Date solto. Data
 * de calendário não tem hora nem fuso: quando vira Date local, um dia de
 * madrugada no horário de verão anda para trás e o guia perde uma pescaria da
 * lista sem entender por quê. Quando precisa de aritmética, o texto vira Date
 * ao meio-dia UTC — longe o bastante das duas bordas para nenhuma mudança de
 * fuso empurrar para o dia vizinho.
 */

export type Vista = 'semana' | 'mes' | 'dia';

export interface Intervalo {
  de: string;
  ate: string;
}

const DIA = 86_400_000;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function paraData(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(iso: string, dias: number): string {
  return paraISO(new Date(paraData(iso).getTime() + dias * DIA));
}

/** Hoje, no fuso de quem está usando — é o dia que a pessoa vê no relógio. */
export function hoje(agora: Date = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * O intervalo que a vista cobre.
 *
 * A semana começa no domingo, como o calendário de parede brasileiro. Começar
 * na segunda deixaria o fim de semana partido em dois — e fim de semana é
 * quando a maior parte das pescarias acontece.
 */
export function intervalo(vista: Vista, ancora: string): Intervalo {
  if (vista === 'dia') return { de: ancora, ate: ancora };

  if (vista === 'semana') {
    const de = somarDias(ancora, -paraData(ancora).getUTCDay());
    return { de, ate: somarDias(de, 6) };
  }

  const [ano, mes] = ancora.split('-').map(Number);
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
  // Dia 0 do mês seguinte é o último dia deste — evita a tabela de 28/30/31 e
  // acerta fevereiro bissexto sozinho.
  const ultimo = new Date(Date.UTC(ano, mes, 0, 12));
  return { de: primeiro, ate: paraISO(ultimo) };
}

/**
 * Anda para frente ou para trás uma unidade da vista.
 *
 * No mês, a âncora vai para o dia 1 antes de andar. Sem isso, 31 de janeiro
 * mais um mês viraria 3 de março — o Date normaliza a data impossível em
 * silêncio, e o guia perderia fevereiro inteiro ao navegar.
 */
export function deslocar(vista: Vista, ancora: string, passos: number): string {
  if (vista === 'dia') return somarDias(ancora, passos);
  if (vista === 'semana') return somarDias(ancora, passos * 7);

  const [ano, mes] = ancora.split('-').map(Number);
  return paraISO(new Date(Date.UTC(ano, mes - 1 + passos, 1, 12)));
}

/** dd/mm/aaaa. */
export function paraBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** O que aparece no topo da tela: "12/03/2026", "8 a 14/03/2026", "março de 2026". */
export function rotulo(vista: Vista, ancora: string): string {
  const { de, ate } = intervalo(vista, ancora);

  if (vista === 'dia') return paraBR(de);

  if (vista === 'semana') {
    const [, mesDe, diaDe] = de.split('-');
    const [anoAte, mesAte, diaAte] = ate.split('-');
    // Semana que não atravessa o mês não precisa repetir o mês duas vezes.
    return mesDe === mesAte
      ? `${diaDe} a ${diaAte}/${mesAte}/${anoAte}`
      : `${diaDe}/${mesDe} a ${diaAte}/${mesAte}/${anoAte}`;
  }

  const [ano, mes] = de.split('-').map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}
