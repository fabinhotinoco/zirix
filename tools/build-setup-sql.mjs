/**
 * Gera supabase/setup-completo.sql: um único arquivo para colar no SQL Editor
 * do Supabase e deixar o banco inteiro pronto.
 *
 *   node tools/build-setup-sql.mjs
 *
 * É gerado, e não mantido à mão, para não sair de sincronia com a migração.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');

const legal = execFileSync('node', [join(RAIZ, 'tools/seed-legal.mjs')], {
  encoding: 'utf8',
});

const cabecalho = `-- =============================================================================
-- SETUP COMPLETO — cole tudo isto no SQL Editor do Supabase e clique em Run.
--
-- Deixa o banco pronto: tabelas, políticas de segurança, valores padrão e os
-- cinco documentos legais. Roda uma vez só, num projeto novo.
--
-- GERADO AUTOMATICAMENTE por tools/build-setup-sql.mjs — não edite este
-- arquivo. Altere supabase/migrations/, supabase/seed.sql ou docs/legal/ e
-- rode o script de novo.
-- =============================================================================

`;

const rodape = `
-- =============================================================================
-- Endurecimento específico do Supabase
--
-- O Supabase concede acesso a novas tabelas por privilégio padrão. Como neste
-- aplicativo nada é visível sem login, o papel anônimo não deve alcançar
-- tabela nenhuma. Sem isto, uma tabela criada no futuro nasceria legível para
-- qualquer pessoa com a chave pública do projeto.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;

-- Confirmação rápida do que foi criado.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas,
  (select count(*) from pg_policies where schemaname = 'public')  as politicas,
  (select count(*) from public.app_settings)                      as configuracoes,
  (select count(*) from public.cancellation_rules)                as faixas_cancelamento,
  (select count(*) from public.legal_documents)                   as documentos_legais;
`;

const partes = [
  cabecalho,
  '-- ===== supabase/migrations/0001_init.sql =====\n',
  ler('supabase/migrations/0001_init.sql'),
  '\n\n-- ===== supabase/seed.sql =====\n',
  ler('supabase/seed.sql'),
  '\n\n-- ===== documentos legais (docs/legal/) =====\n',
  legal,
  rodape,
];

const destino = join(RAIZ, 'supabase/setup-completo.sql');
writeFileSync(destino, partes.join(''));

const linhas = partes.join('').split('\n').length;
console.log(`✓ supabase/setup-completo.sql gerado (${linhas} linhas)`);
