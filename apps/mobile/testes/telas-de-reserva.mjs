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

const AVISOS = [
  {
    id: 'n-1', booking_id: 'r-9', tipo: 'sinal_pago',
    titulo: 'Sinal recebido — 20/12/2026',
    corpo: 'Recebemos R$ 315,00. Falta R$ 735,00, a quitar até 13/12/2026.',
    valor_total_centavos: 105000, valor_pago_centavos: 31500,
    valor_aberto_centavos: 73500, lida_em: null,
    criado_em: new Date().toISOString(),
  },
  {
    id: 'n-2', booking_id: 'r-9', tipo: 'reserva_criada',
    titulo: 'Reserva feita para 20/12/2026',
    corpo: 'Sua reserva com Pesca Vertical está guardada.',
    valor_total_centavos: 105000, valor_pago_centavos: 0,
    valor_aberto_centavos: 105000, lida_em: '2026-08-01T10:00:00Z',
    criado_em: '2026-08-01T09:00:00Z',
  },
];

// Um dia vendido e um livre, para conferir que a tela não inventa "pago zero"
// num dia em que não existe pescaria.
const AGENDA = [
  {
    data: '2026-12-20', boat_id: 'b-1', barco_nome: 'Tucunaré I',
    dia_status: 'aberto', preco_barco_centavos: 60000, preco_passageiro_centavos: 15000,
    observacao: 'Saída 5h', booking_id: 'r-9', reserva_status: 'confirmada',
    status_pagamento: 'sinal_pago', cliente_nome: 'Fabio Tinoco',
    cliente_telefone: '35999990000', qtd_pescadores: 3,
    valor_liquido_centavos: 105000, valor_pago_centavos: 31500,
    valor_aberto_centavos: 73500, repasse_guia_centavos: 94500,
  },
  {
    data: '2026-12-22', boat_id: 'b-1', barco_nome: 'Tucunaré I',
    dia_status: 'aberto', preco_barco_centavos: 60000, preco_passageiro_centavos: 15000,
    observacao: null, booking_id: null, reserva_status: null,
    status_pagamento: null, cliente_nome: null, cliente_telefone: null,
    qtd_pescadores: null, valor_liquido_centavos: null, valor_pago_centavos: null,
    valor_aberto_centavos: null, repasse_guia_centavos: null,
  },
];

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

  // A contagem de não lidos manda `Prefer: count=exact`. Cabeçalho fora da
  // lista simples faz o navegador perguntar antes, com um OPTIONS — e um
  // OPTIONS sem resposta de CORS derruba a requisição seguinte com
  // ERR_ABORTED, que parece defeito do aplicativo e não é.
  if (rota.request().method() === 'OPTIONS') {
    return rota.fulfill({
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, HEAD, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-expose-headers': 'content-range',
      },
    });
  }

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

  if (p === '/rest/v1/notifications') {
    // head=true com count: a contagem vem no cabeçalho, não no corpo.
    if (rota.request().method() === 'HEAD') {
      // Sem `body`: o Chromium aborta uma resposta de HEAD que traga corpo, e o
      // aborto chega como falha de rede — parecendo defeito do aplicativo.
      return rota.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${AVISOS.filter((a) => !a.lida_em).length}`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
      });
    }
    if (rota.request().method() === 'PATCH') return json([]);
    return json(AVISOS);
  }
  if (p === '/rest/v1/rpc/agenda_do_guia') return json(AGENDA);
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
// Requisição que escapa da simulação é falha de teste, não ruído: significa
// que o roteiro deixou de cobrir um caminho. ERR_ABORTED fica de fora porque é
// o navegador cancelando o que estava em voo quando a tela mudou — acontece o
// tempo todo numa navegação normal e não é defeito de ninguém.
pagina.on('requestfailed', (r) => {
  const motivo = r.failure()?.errorText ?? '';
  if (motivo === 'net::ERR_ABORTED') return;
  falhas.push(`requisição não simulada: ${r.method()} ${r.url().slice(0, 120)} — ${motivo}`);
});
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

// O selo de avisos não lidos. Vale a espera: ele vem de uma contagem separada,
// e é justamente por ser enfeite que ninguém repara quando para de funcionar.
await pagina.waitForTimeout(1200);
exigir(await pagina.getByLabel('1 avisos não lidos').isVisible(),
  'o início mostra quantos avisos estão por ler');

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

// --- 6. avisos ---------------------------------------------------------------
// O aviso é registro do passado: os valores são os de quando ele saiu, não o
// saldo de hoje. Se a tela lesse o extrato, reescreveria o que a pessoa leu.
await pagina.goto(`http://localhost:${PORTA}/avisos`);
await pagina.waitForTimeout(1800);
const telaAvisos = await textoDaTela();
exigir(telaAvisos.includes('Sinal recebido'), 'a caixa de avisos lista o aviso de pagamento');
exigir(/Quitado\s*R\$\s*315,00/.test(telaAvisos), 'o aviso mostra quanto já foi quitado');
exigir(/Em aberto\s*R\$\s*735,00/.test(telaAvisos), 'e quanto continua em aberto');
exigir(telaAvisos.includes('Marcar os 1 como lidos'), 'oferece marcar os não lidos');
// O aviso antigo, já lido, continua com os valores dele — não com os de hoje.
exigir(/Em aberto\s*R\$\s*1\.050,00/.test(telaAvisos),
  'o aviso antigo mantém o valor congelado, sem ser reescrito pelo saldo atual');

// --- 7. agenda do guia -------------------------------------------------------
await pagina.goto(`http://localhost:${PORTA}/minha-agenda`);
await pagina.waitForTimeout(1800);
let telaAgenda = await textoDaTela();
exigir(telaAgenda.includes('Minha agenda'), 'a agenda do guia abre');
exigir(telaAgenda.includes('Semana') && telaAgenda.includes('Mês') && telaAgenda.includes('Dia'),
  'oferece as três vistas: semana, mês e dia');
exigir(telaAgenda.includes('Fabio Tinoco'), 'o dia vendido mostra o cliente');
exigir(/Quitado\s*R\$\s*315,00/.test(telaAgenda), 'mostra o quitado do dia vendido');
exigir(/em aberto\s*R\$\s*735,00/.test(telaAgenda), 'mostra o que está em aberto');
exigir(telaAgenda.includes('Livre'), 'o dia sem reserva aparece como livre');
// Total do período: uma reserva de R$ 945,00 de repasse, e nada a mais.
exigir(/Sua parte no período\s*R\$\s*945,00/.test(telaAgenda),
  'o resumo soma a parte do guia no período');

// Navegar de mês em mês não pode pular fevereiro nem travar.
await pagina.getByRole('tab', { name: 'Mês' }).click();
await pagina.waitForTimeout(900);
telaAgenda = await textoDaTela();
const temMes = /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/
  .test(telaAgenda);
exigir(temMes, 'a vista de mês mostra o nome do mês por extenso');

await pagina.getByRole('button', { name: 'Próximo período' }).click();
await pagina.waitForTimeout(700);
exigir((await textoDaTela()).includes('Voltar para hoje'),
  'sair do período atual oferece o caminho de volta');

await pagina.getByRole('tab', { name: 'Dia' }).click();
await pagina.waitForTimeout(700);
// Texto de placeholder não entra no innerText da página — tem de ser procurado
// como campo, senão a asserção falha com a tela certa na frente.
exigir(await pagina.getByPlaceholder('Ir para dd/mm/aaaa').isVisible(),
  'a vista de dia permite pular para uma data específica');
await pagina.getByPlaceholder('Ir para dd/mm/aaaa').fill('31/02/2026');
await pagina.waitForTimeout(500);
exigir((await textoDaTela()).includes('Data inválida'),
  'data que não existe é recusada em vez de virar 03/03');

await navegador.close();
servidor.close();

console.log('');
if (falhas.length) {
  console.log(`${falhas.length} FALHA(S)`);
  falhas.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('TODAS AS TELAS DE RESERVA PASSARAM');
