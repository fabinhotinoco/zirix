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
const DIAS = [{ data: '2026-12-20', hora_saida: '05:00:00', preco_barco_centavos: 60000, preco_passageiro_centavos: 15000, observacao: 'Ponto: rampa do clube' }];
const DOCS = [
  { slug: 'politica_cancelamento', versao: 'v1', titulo: 'Política de Cancelamento', hash_sha256: 'a'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
  { slug: 'termo_responsabilidade', versao: 'v1', titulo: 'Termo de Responsabilidade', hash_sha256: 'b'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
  { slug: 'contrato_cliente', versao: 'v1', titulo: 'Termos de Uso', hash_sha256: 'c'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
  { slug: 'politica_privacidade', versao: 'v1', titulo: 'Política de Privacidade', hash_sha256: 'd'.repeat(64), vigente_desde: '2026-01-01T00:00:00Z' },
];

const PERFIL = { id: 'u-1', nome: 'Fabio Tinoco', role: 'cliente' };
/** O que a pessoa já aceitou. Vazio = documento vigente ainda por aceitar. */
let ACEITES = [];
let aceitesGravados = null;
let chamadaCriarReserva = null;
let chamadaAgenda = null;
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

/**
 * Datas relativas a hoje. Massa com data fixa envelhece: um teste escrito em
 * agosto com dados de dezembro passa hoje e falha em janeiro, e o motivo não
 * aparece em lugar nenhum.
 */
const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const brDe = (iso) => iso.split('-').reverse().join('/');
const DIA_VENDIDO = emDias(0);
const DIA_LIVRE = emDias(1);

const ANUNCIOS = [
  {
    id: 'an-1', posicao: 1, titulo: 'Varas e molinetes', chamada: '10% para quem vem daqui',
    parceiro: 'Loja do Pescador', url: 'https://loja.exemplo.com.br/varas?ref=pv',
    codigo_desconto: 'PESCAVERTICAL10', ativo: true,
  },
  {
    id: 'an-2', posicao: 2, titulo: 'Iscas artificiais', chamada: null,
    parceiro: 'Loja do Pescador', url: 'https://loja.exemplo.com.br/iscas?ref=pv',
    codigo_desconto: null, ativo: true,
  },
  {
    id: 'an-3', posicao: 3, titulo: 'Rascunho não publicado', chamada: null,
    parceiro: 'X', url: 'https://x.exemplo.com', codigo_desconto: null, ativo: false,
  },
];
let cliqueRegistrado = null;

const GUIAS_FILTRO = [
  { id: 'g-1', nome_operacao: 'Pesca Vertical', cidade: 'Boa Esperança' },
  { id: 'g-2', nome_operacao: 'Pescaria do Zé', cidade: 'Guapé' },
];

// Um dia vendido e um livre, para conferir que a tela não inventa "pago zero"
// num dia em que não existe pescaria.
const AGENDA = [
  {
    data: DIA_VENDIDO, hora_saida: '05:00:00', guide_id: 'g-1', guia_nome: 'Pesca Vertical', comissao_centavos: 10500,
    boat_id: 'b-1', barco_nome: 'Tucunaré I',
    dia_status: 'aberto', preco_barco_centavos: 60000, preco_passageiro_centavos: 15000,
    observacao: 'Saída 5h', booking_id: 'r-9', reserva_status: 'confirmada',
    status_pagamento: 'sinal_pago', cliente_nome: 'Fabio Tinoco',
    cliente_telefone: '35999990000', qtd_pescadores: 3,
    valor_liquido_centavos: 105000, valor_pago_centavos: 31500,
    valor_aberto_centavos: 73500, repasse_guia_centavos: 94500,
  },
  {
    data: DIA_LIVRE, hora_saida: null, guide_id: 'g-1', guia_nome: 'Pesca Vertical', comissao_centavos: null,
    boat_id: 'b-1', barco_nome: 'Tucunaré I',
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

  if (p === '/rest/v1/profiles') return json([PERFIL]);
  if (p === '/rest/v1/guides') return json(GUIAS);
  if (p === '/rest/v1/boats') {
    const id = url.searchParams.get('id');
    return json(id ? BARCOS.filter((b) => `eq.${b.id}` === id) : BARCOS);
  }
  if (p === '/rest/v1/legal_documents') return json(DOCS);
  if (p === '/rest/v1/terms_acceptances') {
    if (rota.request().method() === 'POST') {
      aceitesGravados = JSON.parse(rota.request().postData() ?? '[]');
      return json(aceitesGravados);
    }
    return json(ACEITES);
  }

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
  if (p === '/rest/v1/rpc/agenda') {
    const corpo = JSON.parse(rota.request().postData() ?? '{}');
    chamadaAgenda = corpo;
    // O filtro por guia é do master. Simular aqui prova que a tela manda o
    // parâmetro; que ele não vaze nada é assunto do teste de banco.
    return json(corpo.p_guia ? AGENDA.filter((l) => l.guide_id === corpo.p_guia) : AGENDA);
  }
  if (p === '/rest/v1/rpc/guias_com_agenda') return json(GUIAS_FILTRO);
  if (p === '/rest/v1/anuncios') return json(ANUNCIOS);
  if (p === '/rest/v1/rpc/registrar_clique') {
    cliqueRegistrado = JSON.parse(rota.request().postData() ?? '{}');
    return json(null);
  }
  if (p === '/rest/v1/rpc/datas_disponiveis') return json(DIAS);
  if (p === '/rest/v1/rpc/minhas_reservas') return json(RESERVAS);
  if (p === '/rest/v1/rpc/criar_reserva') {
    chamadaCriarReserva = JSON.parse(rota.request().postData() ?? '{}');
    RESERVAS.push({
      id: 'r-1', codigo: null, data: '2026-12-20', qtd_pescadores: 3,
      valor_total_centavos: 105000, desconto_centavos: 0,
      sinal_centavos: 31500, saldo_centavos: 73500,
      status: 'pendente', status_pagamento: 'aguardando_sinal',
      quitacao_vence_em: '2026-12-13', expira_em: null, hora_saida: '05:00:00',
      observacao: 'Ponto: rampa do clube',
      guia_nome: 'Pesca Vertical', guia_cidade: 'Boa Esperança', barco_nome: 'Tucunaré I',
      participantes: [{ nome: 'João', telefone: null }, { nome: 'Maria', telefone: null }],
    });
    return json({ id: 'r-1', valor_total_centavos: 105000, sinal_centavos: 31500 });
  }
  return json([]);
});

const falhas = [];
const ok = (m) => console.log('ok  ' + m);
/** Tudo o que está escrito na tela, já com o text-transform aplicado. */
const textoDaTela = async () => await pagina.locator('body').innerText();
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

ACEITES = [
  { documento_slug: 'contrato_cliente', versao: 'v1', hash_sha256: 'c'.repeat(64) },
  { documento_slug: 'politica_privacidade', versao: 'v1', hash_sha256: 'd'.repeat(64) },
];

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
exigir((await textoDaTela()).includes('Saída 05:00'),
  'a hora de saída aparece antes de escolher o dia');

// --- 4. reserva -------------------------------------------------------------
await pagina.getByText('Reservar', { exact: true }).first().click();
await pagina.waitForTimeout(1500);
exigir(await pagina.getByText('Quantos pescadores').isVisible(), 'a tela de reserva abre');
exigir((await textoDaTela()).includes('Saída 05:00'), 'a tela de reserva repete a hora');

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
exigir((await textoDaTela()).includes('Saída 05:00'),
  '"minhas reservas" mostra a hora em que o barco sai');

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

// --- 7. calendário --------------------------------------------------------
// A agenda ganhou forma de calendário. Uma grade que não mostra o que está
// marcado é só uma tabela de números: o que se verifica aqui é que o dia
// vendido chega até a casa dele.
// O papel vem do perfil, e o perfil é lido na montagem: trocar exige recarregar.
PERFIL.role = 'guia';
await pagina.goto(`http://localhost:${PORTA}/calendario`);
await pagina.waitForTimeout(2000);
let telaAgenda = await textoDaTela();
exigir(telaAgenda.includes('Minha agenda'), 'o calendário abre para o guia');
exigir(
  telaAgenda.includes('Mês') && telaAgenda.includes('Semana') && telaAgenda.includes('Dia'),
  'oferece as três vistas: mês, semana e dia',
);
exigir(telaAgenda.includes('Reservado') && telaAgenda.includes('Livre'),
  'a legenda explica as cores da grade');

// O mês abre por padrão: sete colunas, uma por dia da semana.
const colunas = await pagina.evaluate(() =>
  [...document.querySelectorAll('div')]
    .filter((d) => /^[DSTQ]$/.test(d.textContent?.trim() ?? '')).length);
exigir(colunas >= 7, `a grade do mês tem cabeçalho de sete dias (achei ${colunas})`);

// Tocar num dia leva para o detalhe daquele dia — é o gesto do Google Agenda.
await pagina.getByRole('button', { name: new RegExp('^' + brDe(DIA_VENDIDO)) }).first().click();
await pagina.waitForTimeout(900);
telaAgenda = await textoDaTela();
exigir(telaAgenda.includes('Fabio Tinoco'), 'tocar no dia abre o detalhe com o cliente');
exigir(telaAgenda.includes('05:00'), 'a saída aparece no cartão do dia');
// Dia sem hora não pode virar "00:00": a saída ainda vai ser combinada.
exigir(telaAgenda.includes('Saída 05:00') && !telaAgenda.includes('00:00'),
  'o rótulo da hora é o de verdade, não um horário inventado');
exigir(/Quitado\s*R\$\s*315,00/.test(telaAgenda), 'o detalhe mostra o quitado');
exigir(/em aberto\s*R\$\s*735,00/.test(telaAgenda), 'e o que está em aberto');
exigir(/Sua parte\s*R\$\s*945,00/.test(telaAgenda), 'o resumo mostra a parte do guia');
exigir(!telaAgenda.includes('Comissão da plataforma'),
  'o guia não vê a linha de comissão da plataforma');

await pagina.getByRole('tab', { name: 'Semana' }).click();
await pagina.waitForTimeout(800);
// `innerText` devolve o texto já com o text-transform aplicado: o rótulo está
// em maiúsculas na tela, mesmo escrito em minúsculas no código.
exigir(/na semana/i.test(await textoDaTela()), 'a vista de semana muda o resumo');

await pagina.getByRole('tab', { name: 'Mês' }).click();
await pagina.waitForTimeout(800);
await pagina.getByRole('button', { name: 'Próximo período' }).click();
await pagina.waitForTimeout(700);
exigir((await textoDaTela()).includes('Voltar para hoje'),
  'sair do período atual oferece o caminho de volta');

// --- 7b. o mesmo calendário, pelo lado do master ---------------------------
PERFIL.role = 'master';
await pagina.goto(`http://localhost:${PORTA}/calendario`);
await pagina.waitForTimeout(2000);
const telaMaster = await textoDaTela();
exigir(telaMaster.includes('Agenda da plataforma'), 'o master vê a agenda da plataforma');
exigir(telaMaster.includes('Todas') && telaMaster.includes('Pescaria do Zé'),
  'o master recebe o filtro por operação');
exigir(telaMaster.includes('Comissão da plataforma'),
  'o resumo do master mostra a comissão, não o repasse do guia');

await pagina.getByRole('radio', { name: 'Pescaria do Zé' }).click();
await pagina.waitForTimeout(1200);
exigir(chamadaAgenda?.p_guia === 'g-2', 'filtrar manda o guia escolhido para o servidor');
PERFIL.role = 'guia';

// --- 7c. vitrine de parceiros -----------------------------------------------
// Publicidade tem de ser identificável como tal (art. 36 do CDC). Um cartão que
// parece recomendação da plataforma é o que cria responsabilidade sobre a venda
// de terceiro.
PERFIL.role = 'cliente';
await pagina.goto(`http://localhost:${PORTA}/reservas`);
await pagina.waitForTimeout(2000);
const telaVitrine = await textoDaTela();
exigir(/publicidade/i.test(telaVitrine), 'o bloco é rotulado como publicidade');
exigir(telaVitrine.includes('A compra é feita no site do parceiro'),
  'diz que a compra acontece fora do aplicativo');
exigir(telaVitrine.includes('Varas e molinetes') && telaVitrine.includes('Iscas artificiais'),
  'os anúncios no ar aparecem');
exigir(!telaVitrine.includes('Rascunho não publicado'),
  'anúncio fora do ar não aparece para o cliente');
exigir(telaVitrine.includes('PESCAVERTICAL10'), 'o cupom aparece no cartão');
exigir(telaVitrine.includes('loja.exemplo.com.br'),
  'o domínio aparece: quem clica tem direito de saber para onde vai');

// O clique conta, e conta o anúncio certo.
await pagina.getByRole('link', { name: /Varas e molinetes/ }).click();
await pagina.waitForTimeout(900);
exigir(cliqueRegistrado?.p_anuncio === 'an-1', 'o clique é contado no anúncio certo');

// --- 7d. documento com versão nova ------------------------------------------
// Publicar um texto novo sem esta tela seria publicar para ninguém: quem já tem
// perfil vai direto para o início e a versão que passa a valer não teria sido
// aceita por pessoa nenhuma.
DOCS[3] = { ...DOCS[3], versao: 'v2', hash_sha256: 'e'.repeat(64) };
aceitesGravados = null;
await pagina.goto(`http://localhost:${PORTA}/`);
await pagina.waitForTimeout(2500);

const telaAceite = await textoDaTela();
exigir(/documento mudou|documentos mudaram/i.test(telaAceite),
  'versão nova leva quem já tem cadastro para a tela de aceite');
exigir(telaAceite.includes('Política de Privacidade'), 'o documento que mudou aparece');
exigir(!telaAceite.includes('Termos de Uso'),
  'o documento que NÃO mudou não é pedido de novo');

const botaoAceite = pagina.getByRole('button', { name: 'Confirmar e continuar' });
exigir(await botaoAceite.isDisabled(), 'a caixa nasce desmarcada e o botão espera');
exigir(/falta marcar/i.test(await textoDaTela()), 'e a tela diz o que falta marcar');

await pagina.getByRole('checkbox', { name: /Política de Privacidade/ }).click();
await pagina.waitForTimeout(400);
exigir(await botaoAceite.isEnabled(), 'marcado, o botão libera');

// Ao confirmar, o registro grava a versão NOVA — não a antiga.
ACEITES = [...ACEITES, { documento_slug: 'politica_privacidade', versao: 'v2', hash_sha256: 'e'.repeat(64) }];
await botaoAceite.click();
await pagina.waitForTimeout(2500);
exigir(Array.isArray(aceitesGravados) && aceitesGravados[0]?.versao === 'v2',
  'grava a versão nova, com o hash do texto que foi mostrado');
exigir(aceitesGravados?.[0]?.hash_sha256 === 'e'.repeat(64),
  'o hash gravado é o do texto novo');
exigir((await textoDaTela()).includes('Olá'), 'aceito, a pessoa segue para o início');

// --- 8. aparência: três modos, três paletas ---------------------------------
await pagina.goto(`http://localhost:${PORTA}/aparencia`);
await pagina.waitForTimeout(1800);
const telaAparencia = await textoDaTela();
for (const m of ['Dia', 'Noite', 'Híbrido']) {
  exigir(telaAparencia.includes(m), `a tela de aparência oferece o modo ${m}`);
}
// A paleta é uma só, e de propósito: cor de marca não é preferência de quem
// usa. Se as três voltarem a aparecer aqui, a decisão foi desfeita sem querer.
for (const p of ['Brasa', 'Linha']) {
  exigir(!telaAparencia.includes(p), `a paleta ${p} saiu do aplicativo`);
}

/**
 * A cor que o navegador está de fato pintando no fundo.
 *
 * `querySelector('div')` pega a div externa, que é transparente — e transparente
 * comparado com transparente dá "igual" para qualquer tema. Aqui procura-se o
 * primeiro elemento com fundo de verdade.
 */
const fundoDaTela = () =>
  pagina.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && !c.startsWith('rgba(0, 0, 0, 0)')) return c;
    }
    return '';
  });

await pagina.getByRole('radio', { name: /^Dia/ }).click();
await pagina.waitForTimeout(700);
const fundoDia = await fundoDaTela();

await pagina.getByRole('radio', { name: /^Noite/ }).click();
await pagina.waitForTimeout(700);
const fundoNoite = await fundoDaTela();

// Trocar o modo tem de mudar a tela de verdade. Um seletor bonito que não
// pinta nada passaria em qualquer teste de texto.
exigir(fundoDia !== fundoNoite && fundoDia !== '' && fundoNoite !== '',
  `dia e noite pintam fundos diferentes (${fundoDia} vs ${fundoNoite})`);

const brilho = (rgb) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
exigir(brilho(fundoNoite) < brilho(fundoDia), 'o modo noite é mesmo o mais escuro dos dois');

// A escolha tem de sobreviver a recarregar: preferência que some a cada visita
// não é preferência.
await pagina.reload();
await pagina.waitForTimeout(2200);
exigir(await fundoDaTela() === fundoNoite, 'o modo escolhido sobrevive a recarregar a página');

// O modo escolhido vale nas outras telas, não só onde foi escolhido.
await pagina.goto(`http://localhost:${PORTA}/inicio`);
await pagina.waitForTimeout(1600);
exigir(await fundoDaTela() === fundoNoite, 'o modo escolhido vale em todas as telas');

await navegador.close();
servidor.close();

console.log('');
if (falhas.length) {
  console.log(`${falhas.length} FALHA(S)`);
  falhas.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('TODAS AS TELAS DE RESERVA PASSARAM');
