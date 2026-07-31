/**
 * Publica os documentos de docs/legal/ na tabela legal_documents.
 *
 *   node tools/seed-legal.mjs            → imprime o SQL na saída padrão
 *   node tools/seed-legal.mjs --check    → só confere hash e front-matter
 *
 * O texto legal vive em arquivos versionados no git — é lá que ele é revisado
 * e comparado. O banco recebe uma cópia, e o gatilho calcula o hash. Este
 * script gera o SQL dessa carga.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'legal');

const SLUGS_VALIDOS = new Set([
  'contrato_guia',
  'contrato_cliente',
  'politica_cancelamento',
  'termo_responsabilidade',
  'politica_privacidade',
]);

/** Front-matter simples: só `chave: valor`, um por linha. */
function lerDocumento(arquivo) {
  const bruto = readFileSync(join(DIR, arquivo), 'utf8');
  const m = bruto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    throw new Error(`${arquivo}: falta o bloco de front-matter no topo.`);
  }

  const meta = {};
  for (const linha of m[1].split('\n')) {
    const i = linha.indexOf(':');
    if (i === -1) continue;
    meta[linha.slice(0, i).trim()] = linha
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }

  for (const campo of ['slug', 'versao', 'titulo']) {
    if (!meta[campo]) throw new Error(`${arquivo}: front-matter sem "${campo}".`);
  }
  if (!SLUGS_VALIDOS.has(meta.slug)) {
    throw new Error(
      `${arquivo}: slug "${meta.slug}" não é aceito pelo banco. ` +
        `Válidos: ${[...SLUGS_VALIDOS].join(', ')}`,
    );
  }

  const corpo = m[2].trim();
  return {
    arquivo,
    slug: meta.slug,
    versao: meta.versao,
    titulo: meta.titulo,
    corpo,
    // Mesmo algoritmo do gatilho em Postgres. Se divergirem, o aceite
    // registrado pelo app não corresponderia ao texto guardado no banco.
    hash: createHash('sha256').update(corpo, 'utf8').digest('hex'),
  };
}

/** Dollar-quoting evita qualquer problema de aspas no texto legal. */
function citar(texto) {
  let tag = 'doc';
  while (texto.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${texto}$${tag}$`;
}

const arquivos = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort();
const docs = arquivos.map(lerDocumento);

if (process.argv.includes('--check')) {
  for (const d of docs) {
    console.log(
      `ok  ${d.arquivo.padEnd(28)} ${d.slug.padEnd(24)} v${d.versao.padEnd(6)} ${d.hash.slice(0, 16)}…`,
    );
  }
  const faltando = [...SLUGS_VALIDOS].filter((s) => !docs.some((d) => d.slug === s));
  if (faltando.length) {
    console.log(`\n⚠ ainda sem minuta: ${faltando.join(', ')}`);
  }
  process.exit(0);
}

console.log('-- Gerado por tools/seed-legal.mjs. Não edite à mão:');
console.log('-- altere os arquivos em docs/legal/ e rode o script de novo.');
console.log('-- O hash é recalculado pelo gatilho trg_hash_documento.\n');

for (const d of docs) {
  console.log(`-- ${d.arquivo}  (sha256 ${d.hash})`);
  console.log(
    `insert into public.legal_documents (slug, versao, titulo, corpo_markdown)\n` +
      `values ('${d.slug}', '${d.versao}', ${citar(d.titulo)}, ${citar(d.corpo)})\n` +
      `on conflict (slug, versao) do update set corpo_markdown = excluded.corpo_markdown;\n`,
  );
}
