import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  calcularHash,
  documentosPendentes,
  montarAceites,
  DOCUMENTOS_DO_CADASTRO,
  DOCUMENTOS_DA_RESERVA,
  type DocumentoVigente,
  type AceiteRegistrado,
} from '../src/legal.ts';

const doc = (
  slug: DocumentoVigente['slug'],
  versao: string,
  hash: string,
): DocumentoVigente => ({ slug, versao, titulo: slug, hashSha256: hash });

test('hash bate com o SHA-256 de referência', async () => {
  const texto = 'Contrato de teste — com acento, ç e emoji 🎣';
  assert.equal(
    await calcularHash(texto),
    createHash('sha256').update(texto, 'utf8').digest('hex'),
  );
});

test('nada aceito ainda: tudo fica pendente', () => {
  const vigentes = [doc('contrato_cliente', '1.0', 'aaa'), doc('politica_privacidade', '1.0', 'bbb')];
  const pendentes = documentosPendentes(DOCUMENTOS_DO_CADASTRO.cliente, vigentes, []);
  assert.deepEqual(pendentes.map((d) => d.slug), ['contrato_cliente', 'politica_privacidade']);
});

test('tudo aceito na versão vigente: nada pendente', () => {
  const vigentes = [doc('contrato_cliente', '1.0', 'aaa'), doc('politica_privacidade', '1.0', 'bbb')];
  const aceitos: AceiteRegistrado[] = [
    { documentoSlug: 'contrato_cliente', versao: '1.0', hashSha256: 'aaa' },
    { documentoSlug: 'politica_privacidade', versao: '1.0', hashSha256: 'bbb' },
  ];
  assert.equal(documentosPendentes(DOCUMENTOS_DO_CADASTRO.cliente, vigentes, aceitos).length, 0);
});

test('texto editado sem trocar o número da versão volta a pedir aceite', () => {
  // O caso que a comparação por versão deixaria passar em silêncio.
  const vigentes = [doc('contrato_cliente', '1.0', 'HASH-NOVO'), doc('politica_privacidade', '1.0', 'bbb')];
  const aceitos: AceiteRegistrado[] = [
    { documentoSlug: 'contrato_cliente', versao: '1.0', hashSha256: 'HASH-ANTIGO' },
    { documentoSlug: 'politica_privacidade', versao: '1.0', hashSha256: 'bbb' },
  ];
  const pendentes = documentosPendentes(DOCUMENTOS_DO_CADASTRO.cliente, vigentes, aceitos);
  assert.deepEqual(pendentes.map((d) => d.slug), ['contrato_cliente']);
});

test('guia e cliente aceitam contratos diferentes', () => {
  assert.ok(DOCUMENTOS_DO_CADASTRO.guia.includes('contrato_guia'));
  assert.ok(!DOCUMENTOS_DO_CADASTRO.guia.includes('contrato_cliente'));
  assert.ok(DOCUMENTOS_DO_CADASTRO.cliente.includes('contrato_cliente'));
  assert.ok(!DOCUMENTOS_DO_CADASTRO.cliente.includes('contrato_guia'));
});

test('documento obrigatório não publicado falha alto, não em silêncio', () => {
  assert.throws(
    () => documentosPendentes(DOCUMENTOS_DO_CADASTRO.cliente, [doc('contrato_cliente', '1.0', 'aaa')], []),
    /politica_privacidade/,
  );
});

test('aceite parcial é recusado', () => {
  const pendentes = [doc('politica_cancelamento', '1.0', 'aaa'), doc('termo_responsabilidade', '1.0', 'bbb')];
  assert.throws(() => montarAceites(pendentes, ['politica_cancelamento']), /Faltam aceitar/);
});

test('aceite completo vira registro com hash e reserva', () => {
  const pendentes = DOCUMENTOS_DA_RESERVA.map((s) => doc(s, '1.0', `hash-${s}`));
  const registros = montarAceites(pendentes, [...DOCUMENTOS_DA_RESERVA], 'booking-1');

  assert.equal(registros.length, 2);
  for (const r of registros) {
    assert.equal(r.bookingId, 'booking-1');
    assert.equal(r.hashSha256, `hash-${r.documentoSlug}`);
  }
});
