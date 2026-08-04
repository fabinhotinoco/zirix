/**
 * Hora de saída: leitura tolerante, escrita sempre igual.
 *
 * Quem digita a hora de uma pescaria escreve "5", "5h", "05:00" ou "5h30" — e
 * as quatro querem dizer a mesma coisa. Recusar três delas para aceitar uma é
 * transferir para o guia um trabalho que o programa faz melhor.
 *
 * Guardar é outra história: no banco vai sempre 'HH:MM', porque hora que muda
 * de formato não ordena, e a agenda ordenada por horário é o ponto todo.
 */

/**
 * Texto digitado para 'HH:MM', ou null se não for hora.
 *
 * Aceita '5', '5h', '5:00', '05h30', '5.30', '530', '0530'. Recusa 25:00 e
 * 10:75 — hora que não existe não pode virar meia-noite calada.
 */
export function paraHora(bruto: string): string | null {
  const limpo = bruto.trim().toLowerCase().replace(/\s/g, '');
  if (limpo === '') return null;

  const m = limpo.match(/^(\d{1,2})(?:[h:.,]?(\d{2}))?h?$/);
  if (!m) return null;

  let [, h, min] = m;
  // '530' e '0530' vêm sem separador: os dois últimos dígitos são os minutos.
  if (min === undefined && /^\d{3,4}$/.test(h)) {
    min = h.slice(-2);
    h = h.slice(0, -2);
  }

  const hora = Number(h);
  const minuto = min === undefined ? 0 : Number(min);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null;
  if (hora > 23 || minuto > 59) return null;

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/**
 * O que vem do banco para o que aparece na tela.
 *
 * O Postgres devolve 'HH:MM:SS'. Os segundos de uma hora de saída são sempre
 * zero e só ocupam espaço numa tela estreita.
 */
export function formatarHora(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** 'Saída 05:00' ou 'Horário a combinar' — o segundo é um estado legítimo. */
export function rotuloDaHora(valor: string | null | undefined): string {
  const h = formatarHora(valor);
  return h ? `Saída ${h}` : 'Horário a combinar';
}

/** Ordena por horário, deixando quem não tem hora no fim. */
export function compararHora(a: string | null, b: string | null): number {
  const x = formatarHora(a);
  const y = formatarHora(b);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? -1 : 1;
}
