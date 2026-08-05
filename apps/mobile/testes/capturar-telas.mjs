/**
 * Fotografa as telas num navegador de verdade, para revisão visual.
 *
 *   npx expo export --platform web --output-dir /tmp/dist-teste
 *   DIST=/tmp/dist-teste node testes/capturar-telas.mjs
 *
 * NÃO é teste: não afirma nada e não falha. Serve para alguém OLHAR e opinar —
 * contraste, hierarquia, o que está sobrando, o que está faltando. Coisas que
 * nenhuma asserção pega.
 *
 * Reaproveita a mesma simulação de Supabase e Open-Meteo do roteiro de testes,
 * então nenhuma requisição sai desta máquina e as imagens são reproduzíveis.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.env.DIST ?? '/tmp/dist-teste';
const SAIDA = process.env.SAIDA ?? '/tmp/telas';
const PORTA = Number(process.env.PORTA ?? 4611);
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;

mkdirSync(SAIDA, { recursive: true });

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.ico': 'image/x-icon', '.png': 'image/png',
};

const servidor = createServer((req, res) => {
  const caminho = decodeURIComponent(req.url.split('?')[0]);
  let arquivo = join(DIST, caminho);
  if (!existsSync(arquivo) || caminho === '/') arquivo = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'text/html' });
  res.end(readFileSync(arquivo));
});
await new Promise((r) => servidor.listen(PORTA, r));

// --- massa -------------------------------------------------------------------
const USER = { id: 'u-1', email: 'rodrigo@teste', aud: 'authenticated', role: 'authenticated' };
const SESSAO = {
  access_token: 'fake', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake', user: USER,
};
const PERFIL = { id: 'u-1', nome: 'Rodrigo Nunes', role: 'guia' };

const MEU_GUIA = [{
  id: 'g-1', user_id: 'u-1', nome_operacao: 'Pesca Vertical', documento: '00000000000',
  cidade: 'Niterói', bio: 'Costeira e oceânica saindo do Iate Clube Jurujuba.',
  status: 'aprovado', comissao_percentual: null, mp_conectado_em: null,
  aprovado_em: '2026-01-01T00:00:00Z', criado_em: '2026-01-01T00:00:00Z',
  local_operacao_lat: -22.9265, local_operacao_lng: -43.1176,
}];

const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const AGENDA = [
  {
    data: emDias(0), hora_saida: '05:30:00', guide_id: 'g-1', guia_nome: 'Pesca Vertical',
    comissao_centavos: 12000, boat_id: 'b-1', barco_nome: 'Jurujuba I', dia_status: 'aberto',
    preco_barco_centavos: 80000, preco_passageiro_centavos: 20000, observacao: 'Saída do Iate Clube',
    booking_id: 'r-1', reserva_status: 'confirmada', status_pagamento: 'sinal_pago',
    cliente_nome: 'Fabio Tinoco', cliente_telefone: '21999990000', qtd_pescadores: 4,
    valor_liquido_centavos: 120000, valor_pago_centavos: 36000,
    valor_aberto_centavos: 84000, repasse_guia_centavos: 108000,
  },
  {
    data: emDias(2), hora_saida: '06:00:00', guide_id: 'g-1', guia_nome: 'Pesca Vertical',
    comissao_centavos: null, boat_id: 'b-1', barco_nome: 'Jurujuba I', dia_status: 'aberto',
    preco_barco_centavos: 80000, preco_passageiro_centavos: 20000, observacao: null,
    booking_id: null, reserva_status: null, status_pagamento: null, cliente_nome: null,
    cliente_telefone: null, qtd_pescadores: null, valor_liquido_centavos: null,
    valor_pago_centavos: null, valor_aberto_centavos: null, repasse_guia_centavos: null,
  },
];

const AVISOS = [
  {
    id: 'n-1', booking_id: 'r-1', tipo: 'sinal_pago',
    titulo: `Sinal recebido — ${emDias(0).split('-').reverse().join('/')}`,
    corpo: 'Recebemos R$ 360,00. Falta R$ 840,00, a quitar até a véspera.',
    valor_total_centavos: 120000, valor_pago_centavos: 36000,
    valor_aberto_centavos: 84000, lida_em: null, criado_em: new Date().toISOString(),
  },
];

const ANUNCIOS = [
  { id: 'an-1', posicao: 1, titulo: 'Varas e molinetes', chamada: '10% para quem vem daqui',
    parceiro: 'Loja do Pescador', url: 'https://loja.exemplo.com.br/varas?ref=pv',
    codigo_desconto: 'PESCAVERTICAL10', ativo: true },
  { id: 'an-2', posicao: 2, titulo: 'Iscas artificiais', chamada: null,
    parceiro: 'Loja do Pescador', url: 'https://loja.exemplo.com.br/iscas?ref=pv',
    codigo_desconto: null, ativo: true },
];

function previsao() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const horas = 24 * 7;
  const time = [];
  const p = (v) => String(v).padStart(2, '0');
  for (let h = 0; h < horas; h += 1) {
    const d = new Date(inicio.getTime() + h * 3_600_000);
    time.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`);
  }
  const em = (f) => Array.from({ length: horas }, (_, h) => f(h));
  return {
    tempo: { hourly: {
      time,
      temperature_2m: em((h) => 23 + 5 * Math.sin(((h % 24) - 9) / 24 * 2 * Math.PI)),
      apparent_temperature: em(() => 26),
      relative_humidity_2m: em(() => 72),
      pressure_msl: em((h) => 1018 - h * 0.02),
      surface_pressure: em(() => 1016),
      wind_speed_10m: em((h) => 7 + 3 * Math.sin(h / 8)),
      wind_gusts_10m: em(() => 13),
      wind_direction_10m: em(() => 60),
      cloud_cover: em(() => 40),
      uv_index: em((h) => ((h % 24) > 9 && (h % 24) < 16 ? 8 : 1)),
      visibility: em(() => 24000),
      precipitation_probability: em(() => 12),
      precipitation: em(() => 0),
      weather_code: em(() => 2),
    } },
    mar: { hourly: {
      time,
      wave_height: em((h) => 0.5 + 0.2 * Math.sin(h / 10)),
      wave_period: em(() => 9),
      wave_direction: em(() => 140),
      sea_surface_temperature: em(() => 23.5),
      sea_level_height_msl: em((h) => 0.6 * Math.sin(((h - 3) / 12.42) * 2 * Math.PI + Math.PI / 2)),
      ocean_current_velocity: em(() => 0.7),
      ocean_current_direction: em(() => 210),
    } },
  };
}
const PREVISAO = previsao();

// --- navegador ---------------------------------------------------------------
const navegador = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
// iPhone 14 Pro em pé.
const GRAVAR = process.env.GRAVAR === '1';
const ctx = await navegador.newContext({
  viewport: { width: 393, height: 852 },
  // Sem retina ao gravar: o vídeo sai com o dobro da resolução e a compressão
  // do WebM cresce sem que se veja diferença numa animação.
  deviceScaleFactor: GRAVAR ? 1 : 2,
  ...(GRAVAR ? { recordVideo: { dir: SAIDA, size: { width: 393, height: 852 } } } : {}),
});



await ctx.route(/supabase\.co/, async (rota) => {
  const url = new URL(rota.request().url());
  const p = url.pathname;
  const json = (corpo) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  const um = (lista) =>
    (rota.request().headers()['accept'] ?? '').includes('vnd.pgrst.object') ? (lista[0] ?? null) : lista;

  if (rota.request().method() === 'OPTIONS') {
    return rota.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range',
    } });
  }
  // A tela de condições pede a previsão ao SERVIDOR, não ao Open-Meteo — é o
  // cache compartilhado. A função devolve as duas respostas cruas embrulhadas.
  if (p === '/functions/v1/previsao') {
    return json({
      dados: { tempo: PREVISAO.tempo, mar: PREVISAO.mar },
      temDadosDeMar: true,
      fonte: 'Open-Meteo',
      buscadoEm: new Date().toISOString(),
      doCache: false,
    });
  }

  if (p.startsWith('/auth/v1/user')) return json(USER);
  if (p.startsWith('/auth/v1/token')) return json(SESSAO);
  if (p === '/rest/v1/profiles') return json(um([PERFIL]));
  if (p === '/rest/v1/guides') return json(um(MEU_GUIA));
  if (p === '/rest/v1/app_settings') return json(um([{ valor: 10 }]));
  if (p === '/rest/v1/anuncios') return json(ANUNCIOS);
  if (p === '/rest/v1/rpc/agenda') return json(AGENDA);
  if (p === '/rest/v1/rpc/guias_com_agenda') return json([]);
  if (p === '/rest/v1/legal_documents') return json([]);
  if (p === '/rest/v1/terms_acceptances') return json([]);
  if (p === '/rest/v1/notifications') {
    if (rota.request().method() === 'HEAD') {
      return rota.fulfill({ status: 200, headers: {
        'content-range': '0-0/1', 'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      }, body: '' });
    }
    return json(AVISOS);
  }
  return json([]);
});

const pagina = await ctx.newPage();

async function entrar() {
  await pagina.goto(`http://localhost:${PORTA}/`);
  await pagina.waitForTimeout(2500);
  const campo = pagina.getByPlaceholder('voce@exemplo.com');
  if (await campo.isVisible().catch(() => false)) {
    await campo.fill('rodrigo@teste');
    await pagina.getByPlaceholder('••••••••').fill('12345678');
    await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
    await pagina.waitForTimeout(2500);
  }
}

async function foto(rota, nome, { espera = 2500 } = {}) {
  await pagina.goto(`http://localhost:${PORTA}${rota}`);
  await pagina.waitForTimeout(espera);
  await pagina.screenshot({ path: join(SAIDA, `${nome}.png`) });
  console.log(`✓ ${nome}.png`);
}

/**
 * Fotografa uma tela longa em pedaços.
 *
 * `fullPage` não serve aqui: no React Native Web a rolagem acontece dentro de
 * um ScrollView, não no documento, então a página inteira mede uma tela só e a
 * foto sai cortada — o que aconteceu na primeira tentativa.
 */
async function fotoRolando(rota, nome, quantas, { espera = 3500 } = {}) {
  await pagina.goto(`http://localhost:${PORTA}${rota}`);
  await pagina.waitForTimeout(espera);
  for (let i = 0; i < quantas; i += 1) {
    if (i > 0) {
      await pagina.mouse.wheel(0, 760);
      await pagina.waitForTimeout(700);
    }
    await pagina.screenshot({ path: join(SAIDA, `${nome}-${i + 1}.png`) });
    console.log(`✓ ${nome}-${i + 1}.png`);
  }
}

async function definirModo(modo) {
  await pagina.goto(`http://localhost:${PORTA}/aparencia`);
  await pagina.waitForTimeout(1800);
  const rotulo = modo === 'noite' ? 'Noite' : 'Dia';
  const alvo = pagina.getByText(rotulo, { exact: true }).first();
  if (await alvo.isVisible().catch(() => false)) await alvo.click();
  await pagina.waitForTimeout(1200);
}

await entrar();

// Gravando: percorre as telas devagar, para o movimento aparecer no vídeo.
if (GRAVAR) {
  await definirModo('noite');
  for (const rota of ['/inicio', '/condicoes', '/guia', '/calendario', '/condicoes']) {
    await pagina.goto(`http://localhost:${PORTA}${rota}`);
    await pagina.waitForTimeout(rota === '/condicoes' ? 5200 : 3200);
    if (rota === '/condicoes') {
      for (let i = 0; i < 3; i += 1) {
        await pagina.mouse.wheel(0, 620);
        await pagina.waitForTimeout(900);
      }
    }
  }
  await ctx.close();
  await navegador.close();
  servidor.close();
  console.log(`\nVídeo em ${SAIDA}`);
  process.exit(0);
}

for (const modo of ['noite', 'dia']) {
  await definirModo(modo);
  await foto('/inicio', `${modo}-1-inicio`);
  await fotoRolando('/condicoes', `${modo}-2-condicoes`, 6);
  await fotoRolando('/guia', `${modo}-3-minha-operacao`, 2);
  await foto('/calendario', `${modo}-4-calendario`);
  await foto('/avisos', `${modo}-5-avisos`);
}

await navegador.close();
servidor.close();
console.log(`\nImagens em ${SAIDA}`);
