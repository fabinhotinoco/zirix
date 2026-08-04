/**
 * Percorre as telas de reserva num navegador de verdade, com o Supabase
 * inteiramente simulado.
 *
 * O verificador de tipos e o empacotador não pegam o que de fato quebra na
 * tela: botão desabilitado sem dizer o porquê, texto branco sobre fundo
 * branco, tela que não muda depois de um clique. Foram exatamente esses três
 * os problemas relatados por quem estava usando o aplicativo — e nenhum deles
 * apareceu em CI antes deste roteiro existir.
 *
 *   npx expo export --platform web --output-dir /tmp/dist-teste
 *   DIST=/tmp/dist-teste node testes/telas-de-reserva.mjs
 *
 * NENHUMA requisição sai desta máquina: toda chamada para qualquer host
 * `supabase.co` é interceptada e respondida com massa de teste. É isso que
 * permite rodar sem tocar no banco de verdade.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.env.DIST ?? '/tmp/dist-teste';
const PORTA = Number(process.env.PORTA ?? 4599);
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;

const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const servidor = createServer((req, res) => {
  const caminho = decodeURIComponent(req.url.split('?')[0]);
  let arquivo = join(DIST, caminho);
  if (!existsSync(arquivo) || caminho === '/') arquivo = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'text/html' });
  res.end(readFileSync(arquivo));
});
await new Promise((r) => servidor.listen(PORTA, r));

// --- massa de dados ---------------------------------------------------------
const USER = { id: 'u-1', email: 'pescador@teste', aud: 'authenticated', role: 'authenticated' };
const SESSAO = {
  access_token: 'fake', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake', user: USER,
};

const GUIAS = [{ id: 'g-1', nome_operacao: 'Pesca Vertical', cidade: 'Boa Esperança', bio: 'Tucunaré em Furnas.', foto_url: null }];
const BARCOS = [{ id: 'b-1', nome: 'Tucunaré I', modelo: 'Fibrafort 190', capacidade_min: 1, capacidade_max: 4, equipamentos: 'Sonar, coletes' }];
const DIAS = [{ data: '2026-12-20', preco_barco_centavos: 60000, preco_passageiro_centavos: 15000, observacao: 'Saída 5h' }];
const DOCS = [
  { slug: 'politica_cancelamento', versao: 'v1', titulo: 'Política de Cancelamento', hash_sha256: 'a'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
  { slug: 'termo_responsabilidade', versao: 'v1', titulo: 'Termo de Responsabilidade', hash_sha256: 'b'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
];

let chamadaCriarReserva = null;
const RESERVAS = [];

const navegador = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM } : {},
);
const ctx = await navegador.newContext();

// Intercepta QUALQUER host do Supabase: nada sai desta máquina.
await ctx.route(/supabase\.co/, async (rota) => {
  const url = new URL(rota.request().url());
  const p = url.pathname;
  const json = (corpo, status = 200) =>
    rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });

  if (p.startsWith('/auth/v1/user')) return json(USER);
  if (p.startsWith('/auth/v1/token')) return json(SESSAO);
  if (p.startsWith('/auth/v1/logout')) return rota.fulfill({ status: 204, body: '' });

  if (p === '/rest/v1/profiles') return json([{ id: 'u-1', nome: 'Fabio Tinoco', role: 'cliente' }]);
  if (p === '/rest/v1/guides') return json(GUIAS);
  if (p === '/rest/v1/boats') {
    const id = url.searchParams.get('id');
    return json(id ? BARCOS.filter((b) => `eq.${b.id}` === id) : BARCOS);
  }
  if (p === '/rest/v1/legal_documents') return json(DOCS);
  if (p === '/rest/v1/terms_acceptances') return json([]);

  if (p === '/rest/v1/rpc/datas_disponiveis') return json(DIAS);
  if (p === '/rest/v1/rpc/minhas_reservas') return json(RESERVAS);
  if (p === '/rest/v1/rpc/criar_reserva') {
    chamadaCriarReserva = JSON.parse(rota.request().postData() ?? '{}');
    RESERVAS.push({
      id: 'r-1', codigo: null, data: '2026-12-20', qtd_pescadores: 3,
      valor_total_centavos: 105000, desconto_centavos: 0,
      sinal_centavos: 31500, saldo_centavos: 73500,
      status: 'pendente', status_pagamento: 'aguardando_sinal',
      quitacao_vence_em: '2026-12-13', expira_em: null,
      guia_nome: 'Pesca Vertical', guia_cidade: 'Boa Esperança', barco_nome: 'Tucunaré I',
      participantes: [{ nome: 'João', telefone: null }, { nome: 'Maria', telefone: null }],
    });
    return json({ id: 'r-1', valor_total_centavos: 105000, sinal_centavos: 31500 });
  }
  return json([]);
});

const falhas = [];
const ok = (m) => console.log('ok  ' + m);
const exigir = (cond, m) => (cond ? ok(m) : (falhas.push(m), console.log('FALHA  ' + m)));

const pagina = await ctx.newPage();
// Requisição que escapa da simulação é falha de teste, não ruído: significa
// que o roteiro deixou de cobrir um caminho.
pagina.on('requestfailed', (r) =>
  falhas.push(`requisição não simulada: ${r.url().slice(0, 120)}`),
);
pagina.on('pageerror', (e) => falhas.push('erro de página: ' + e.message));

// --- 0. entrar pela própria tela de login -----------------------------------
// Semear a sessão na marra dependeria de detalhes internos do armazenamento;
// entrar de verdade verifica também o caminho que a pessoa percorre.
await pagina.goto(`http://localhost:${PORTA}/`);
await pagina.waitForTimeout(2500);
await pagina.getByPlaceholder('voce@exemplo.com').fill('pescador@teste');
await pagina.getByPlaceholder('••••••••').fill('12345678');
await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
await pagina.waitForTimeout(2500);

// --- 1. início --------------------------------------------------------------
exigir(await pagina.getByText('Procurar pescaria').isVisible(), 'o início oferece "Procurar pescaria"');
exigir(await pagina.getByText('Minhas reservas', { exact: true }).first().isVisible(), 'o início oferece "Minhas reservas"');

// --- 2. busca ---------------------------------------------------------------
await pagina.getByText('Procurar pescaria').click();
await pagina.waitForTimeout(1200);
exigir(await pagina.getByText('Pesca Vertical').first().isVisible(), 'a busca lista o guia aprovado');

await pagina.getByPlaceholder('Buscar por nome ou cidade').fill('zzz');
await pagina.waitForTimeout(400);
exigir(await pagina.getByText(/Nada encontrado/).isVisible(), 'busca sem resultado explica em vez de ficar em branco');
await pagina.getByPlaceholder('Buscar por nome ou cidade').fill('');
await pagina.waitForTimeout(300);

// --- 3. operação ------------------------------------------------------------
await pagina.getByText('Ver barcos e datas →').click();
await pagina.waitForTimeout(1200);
exigir(await pagina.getByText('Tucunaré I').first().isVisible(), 'a operação lista o barco');
exigir(await pagina.getByText('20/12/2026').first().isVisible(), 'a data livre aparece em dd/mm/aaaa');
exigir(await pagina.getByText(/R\$\s*600,00 o dia/).first().isVisible(), 'o preço do dia aparece em reais');

// --- 4. reserva -------------------------------------------------------------
await pagina.getByText('Reservar', { exact: true }).first().click();
await pagina.waitForTimeout(1500);
exigir(await pagina.getByText('Quantos pescadores').isVisible(), 'a tela de reserva abre');

const textoDaTela = async () => await pagina.locator('body').innerText();
exigir((await textoDaTela()).includes('750,00'), 'prévia de 1 pescador = R$ 750,00');

await pagina.getByLabel('Mais um pescador').click();
await pagina.getByLabel('Mais um pescador').click();
await pagina.waitForTimeout(400);
const tela3 = await textoDaTela();
exigir(tela3.includes('1.050,00') && !tela3.includes('750,00'),
  'prévia de 3 pescadores vira R$ 1.050,00 e o valor antigo some');
exigir(!tela3.includes('um dos 1'), 'a frase dos acompanhantes concorda com o número');

// O botão não pode ficar desabilitado sem dizer o porquê — foi assim que a
// tela de cadastro virou "dois colchetes" para quem estava usando.
const botao = pagina.getByRole('button', { name: 'Confirmar reserva' });
exigir(await botao.isDisabled(), 'confirmar começa desabilitado');
exigir(await pagina.getByText(/^Falta /).isVisible(), 'e a tela diz o que falta');

// Nome em branco tem de bloquear.
await pagina.getByText('+ Adicionar acompanhante').click();
await pagina.waitForTimeout(300);
exigir(await pagina.getByText(/nome de cada acompanhante/).isVisible(), 'acompanhante sem nome é apontado');
await pagina.getByPlaceholder('Nome completo').fill('João');
await pagina.waitForTimeout(300);
exigir(!(await pagina.getByText(/nome de cada acompanhante/).isVisible().catch(() => false)),
  'preenchido o nome, o aviso some');

for (const doc of [/Política de Cancelamento/, /Termo de Responsabilidade/]) {
  await pagina.getByRole('checkbox', { name: doc }).click();
  await pagina.waitForTimeout(200);
}
await pagina.waitForTimeout(400);
exigir(await botao.isEnabled(), 'com os dois aceites marcados, confirmar habilita');

await botao.click();
await pagina.waitForTimeout(2000);

exigir(chamadaCriarReserva !== null, 'confirmar chama criar_reserva');
if (chamadaCriarReserva) {
  const enviado = JSON.stringify(chamadaCriarReserva);
  exigir(!/preco|valor|centavos|total/i.test(enviado),
    'o aplicativo NÃO manda preço nenhum — só o que a pessoa quer');
  exigir(chamadaCriarReserva.p_qtd_pescadores === 3, 'manda a quantidade escolhida');
  exigir(chamadaCriarReserva.p_aceitou_politica === true && chamadaCriarReserva.p_aceitou_termo === true,
    'manda os dois aceites');
  exigir(Array.isArray(chamadaCriarReserva.p_participantes) && chamadaCriarReserva.p_participantes.length === 1,
    'manda o acompanhante cadastrado');
}

// --- 5. minhas reservas -----------------------------------------------------
await pagina.waitForTimeout(1500);
exigir(pagina.url().endsWith('/reservas'),
  'depois de confirmar, a tela muda para "Minhas reservas"');
exigir(await pagina.getByText('Aguardando pagamento').isVisible(), 'a reserva aparece como aguardando pagamento');
exigir(await pagina.getByText(/Sinal R\$\s*315,00/).isVisible(), 'mostra o sinal calculado pelo servidor');
exigir(await pagina.getByText(/Com você: João, Maria/).isVisible(), 'mostra os acompanhantes');
exigir(await pagina.getByText('Desistir desta reserva').isVisible(), 'oferece desistir enquanto nada foi pago');

await navegador.close();
servidor.close();

console.log('');
if (falhas.length) {
  console.log(`${falhas.length} FALHA(S)`);
  falhas.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('TODAS AS TELAS DE RESERVA PASSARAM');
