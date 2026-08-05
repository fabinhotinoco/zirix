/**
 * Previsão de um ponto, com cache compartilhado.
 *
 * É o ÚNICO lugar da plataforma que fala com o provedor de previsão. O
 * aplicativo pede aqui; se o dado guardado ainda está fresco, ele volta do
 * banco sem sair para a internet.
 *
 * POR QUE ISSO IMPORTA MAIS DO QUE PARECE.
 *
 * Com cada celular buscando direto, o número de chamadas cresce com o número de
 * USUÁRIOS. Com o cache, cresce com o número de PONTOS DE PESCA: um ponto custa
 * 24 chamadas por dia, tenha ele um pescador ou dez mil. É a diferença entre
 * caber com folga em qualquer plano e estourar no primeiro sábado movimentado.
 *
 * Também é o que torna a troca de provedor barata: quem sabe falar com o
 * Open-Meteo é este arquivo, e mais ninguém.
 *
 * PUBLICADA COM VERIFICAÇÃO DE JWT LIGADA (o padrão). Sem isso, este endereço
 * seria um proxy grátis de previsão para o mundo inteiro, pago pela cota da
 * plataforma.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const TEMPO = 'https://api.open-meteo.com/v1/forecast';
const MAR = 'https://marine-api.open-meteo.com/v1/marine';

const CAMPOS_HORA = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'surface_pressure', 'pressure_msl', 'wind_speed_10m', 'wind_gusts_10m',
  'wind_direction_10m', 'cloud_cover', 'uv_index', 'visibility',
  'precipitation_probability', 'precipitation', 'weather_code',
].join(',');

const CAMPOS_MAR = [
  'wave_height', 'wave_period', 'wave_direction',
  'sea_surface_temperature', 'sea_level_height_msl',
  'ocean_current_velocity', 'ocean_current_direction',
].join(',');

const DIAS = 7;
/** Previsão de sete dias não muda de quinze em quinze minutos. */
const VALIDADE_MS = 60 * 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

/** Chave do ponto: 3 casas ≈ 100 m, que é o mesmo lugar para a previsão. */
const chaveDo = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

async function doBanco(chave: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/previsoes?chave=eq.${encodeURIComponent(chave)}&select=*`,
    { headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  if (!r.ok) return null;
  const linhas = (await r.json()) as Array<Record<string, unknown>>;
  return linhas[0] ?? null;
}

async function guardar(
  chave: string, lat: number, lng: number,
  dados: unknown, temMar: boolean,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/previsoes`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
      // Um ponto tem uma linha só: a busca nova substitui a anterior.
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      chave, lat, lng, dados,
      tem_dados_de_mar: temMar,
      fonte: 'Open-Meteo',
      buscado_em: new Date().toISOString(),
    }),
  });
}

async function buscarDoProvedor(lat: number, lng: number) {
  const comum = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`
    + `&forecast_days=${DIAS}&timezone=auto`;

  const pegar = async (url: string) => {
    try {
      const r = await fetch(url);
      return r.ok ? await r.json() : null;
    } catch {
      // O serviço marinho pode falhar sozinho — ponto de água interior, ou
      // indisponibilidade. Não é motivo para o dia inteiro sumir.
      return null;
    }
  };

  const [tempo, mar] = await Promise.all([
    pegar(`${TEMPO}?${comum}&hourly=${CAMPOS_HORA}&wind_speed_unit=kn`),
    pegar(`${MAR}?${comum}&hourly=${CAMPOS_MAR}`),
  ]);

  return { tempo, mar };
}

/** Tem altura de onda? Então é mar. É assim que a plataforma classifica o ponto. */
function temMar(mar: unknown): boolean {
  const alturas = (mar as { hourly?: { wave_height?: unknown } } | null)?.hourly?.wave_height;
  return Array.isArray(alturas) && alturas.some((v) => typeof v === 'number' && Number.isFinite(v));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('função sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
    return json({ erro: 'Configuração incompleta no servidor.' }, 500);
  }

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json({ erro: 'Coordenada inválida.' }, 400);
  }

  const chave = chaveDo(lat, lng);
  const guardado = await doBanco(chave);
  const idadeMs = guardado
    ? Date.now() - new Date(guardado.buscado_em as string).getTime()
    : Infinity;

  if (guardado && idadeMs < VALIDADE_MS) {
    return json({
      dados: guardado.dados,
      temDadosDeMar: guardado.tem_dados_de_mar,
      fonte: guardado.fonte,
      buscadoEm: guardado.buscado_em,
      doCache: true,
    });
  }

  const { tempo, mar } = await buscarDoProvedor(lat, lng);

  if (!tempo) {
    // Provedor fora do ar. Dado vencido é melhor que tela vazia — desde que a
    // idade vá junto, para o aplicativo poder dizer de quando é.
    if (guardado) {
      return json({
        dados: guardado.dados,
        temDadosDeMar: guardado.tem_dados_de_mar,
        fonte: guardado.fonte,
        buscadoEm: guardado.buscado_em,
        doCache: true,
        vencido: true,
      });
    }
    return json({ erro: 'Não consegui buscar a previsão agora.' }, 502);
  }

  const dados = { tempo, mar };
  const comMar = temMar(mar);

  // Guardar não pode atrasar a resposta: quem pediu já tem o que precisa.
  guardar(chave, lat, lng, dados, comMar).catch((e) =>
    console.error('falha ao guardar a previsão:', e),
  );

  return json({
    dados,
    temDadosDeMar: comMar,
    fonte: 'Open-Meteo',
    buscadoEm: new Date().toISOString(),
    doCache: false,
  });
});
