/**
 * Confere que o SHA-256 calculado fora do banco é idêntico ao que o gatilho do
 * Postgres gravou.
 *
 * Se divergirem, o hash registrado no aceite não corresponde ao texto guardado
 * — e o registro perde o valor probatório. Por isso isto é um teste, não uma
 * conferência manual.
 *
 *   node tools/verificar-hashes.mjs
 *
 * Usa as variáveis PG* do ambiente (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'legal');

const psql = (sql) =>
  execFileSync(
    'psql',
    [
      '-h', process.env.PGHOST ?? 'localhost',
      '-p', process.env.PGPORT ?? '5432',
      '-U', process.env.PGUSER ?? 'postgres',
      '-d', process.env.PGDATABASE ?? 'zirix',
      '-tAF', '\t', '-c', sql,
    ],
    { encoding: 'utf8' },
  );

const doBanco = new Map(
  psql('select slug, hash_sha256 from public.legal_documents order by slug;')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t')),
);

if (doBanco.size === 0) {
  console.error('✗ Nenhum documento legal encontrado no banco.');
  process.exit(1);
}

let ok = true;

for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const bruto = readFileSync(join(DIR, arquivo), 'utf8');
  const m = bruto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) continue;

  const slug = m[1].match(/^slug:\s*(.+)$/m)?.[1].trim();
  const corpo = m[2].trim();
  const local = createHash('sha256').update(corpo, 'utf8').digest('hex');
  const banco = doBanco.get(slug);

  if (!banco) {
    console.error(`✗ ${slug} não está publicado no banco.`);
    ok = false;
    continue;
  }
  const igual = local === banco;
  if (!igual) ok = false;
  console.log(
    `${igual ? 'ok   ' : 'FALHA'} ${slug.padEnd(24)} banco=${banco.slice(0, 12)} arquivo=${local.slice(0, 12)}`,
  );
}

console.log(
  ok
    ? '\nBanco e aplicativo concordam sobre o texto de cada documento.'
    : '\nDIVERGÊNCIA: o texto no banco não é o mesmo dos arquivos.',
);
process.exit(ok ? 0 : 1);
