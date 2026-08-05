/**
 * Condições de Pesca.
 *
 * A pergunta que esta tela responde em trinta segundos é uma só: **vale a pena
 * sair?** Tudo aqui está ordenado por isso — a nota e o motivo primeiro, o
 * detalhe depois, para quem quiser conferir.
 *
 * DUAS DECISÕES QUE EXPLICAM O LAYOUT:
 *
 * 1. **Alerta de perigo vem antes de qualquer outra coisa**, acima até da nota.
 *    Uma tela que mostra "34/100" e esconde "trovoada prevista" três rolagens
 *    abaixo está informando sem avisar.
 *
 * 2. **Seção sem dado não aparece.** Represa não tem maré nem ondulação de mar
 *    aberto; mostrar "0,0 m" ali seria mentira com cara de dado, e o guia que
 *    entende do assunto perderia a confiança na tela inteira.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LeituraDoDia } from '@pescavertical/core/pesca/inteligencia';
import { dec, estadoDoMar, NOME_DO_MAR, rumo } from '@pescavertical/core/pesca/tipos';
import { NOME_DA_FASE } from '@pescavertical/core/pesca/astro';

import { useAuth } from '@/lib/auth';
import { mensagemDeErro } from '@/lib/erros';
import { pontosDePesca, type PontoDePesca } from '@/lib/locais';
import { condicoesDoLocal, type Condicoes } from '@/servicos/clima';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { BarraViva, ColunaViva, NumeroVivo, Respirar, Surgir } from '@/ui/movimento';
import { Vitrine } from '@/ui/vitrine';
import { useTema, type Cores } from '@/ui/tema';

const hhmm = (d: Date | null | undefined) =>
  d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const diaCurto = (d: Date) =>
  d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Posição da hora dentro da faixa visível, para escalonar a entrada. */
const indiceDaHora = (d: Date) => Math.max(0, d.getHours() - 4);

const numero = (v: number | null | undefined, casas = 0, sufixo = '') =>
  v === null || v === undefined ? '—' : `${dec(v, casas)}${sufixo}`;

export default function CondicoesDePesca() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao } = useAuth();

  const [pontos, setPontos] = useState<PontoDePesca[]>([]);
  const [ponto, setPonto] = useState<PontoDePesca | null>(null);
  const [dados, setDados] = useState<Condicoes | null>(null);
  const [diaAberto, setDiaAberto] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // 1. quais pontos existem
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await pontosDePesca(sessao?.user.id ?? null);
        if (!vivo) return;
        setPontos(lista);
        setPonto(lista[0] ?? null);
        if (lista.length === 0) setCarregando(false);
      } catch (e) {
        if (vivo) {
          setErro(mensagemDeErro(e, 'Não consegui carregar os pontos de pesca.'));
          setCarregando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [sessao?.user.id]);

  // 2. condições do ponto escolhido
  const buscar = useCallback(
    async (forcarBusca = false) => {
      if (!ponto) return;
      setErro(null);
      try {
        setDados(await condicoesDoLocal(ponto, { forcarBusca }));
        setDiaAberto(0);
      } catch (e) {
        setErro(mensagemDeErro(e, 'Não consegui buscar as condições agora.'));
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [ponto],
  );

  useEffect(() => {
    if (!ponto) return;
    setCarregando(true);
    void buscar();
  }, [ponto, buscar]);

  const hoje: LeituraDoDia | null = dados?.dias[diaAberto] ?? null;
  const mar = dados?.local.agua === 'salgada';

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => {
            setAtualizando(true);
            void buscar(true);
          }}
          tintColor={cores.acento}
        />
      }
    >
      {/* A água do cabeçalho fica mexida quando o mar está mexido. Ondulação
          de 0,5 m é calmaria; 2,5 m já é dia de não sair. */}
      <Titulo agitacao={hoje?.agora?.ondaM != null ? Math.min(1, hoje.agora.ondaM / 2.5) : 0.3}>
        Condições de pesca
      </Titulo>

      {/* --- escolha do ponto --- */}
      {pontos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.chips}>
          {pontos.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPonto(p)}
              style={[estilos.chip, ponto?.id === p.id && estilos.chipAtivo]}
            >
              <Text style={[estilos.chipTexto, ponto?.id === p.id && estilos.chipTextoAtivo]}>
                {p.nome}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Erro mensagem={erro} />

      {carregando ? (
        <Esqueleto cores={cores} />
      ) : pontos.length === 0 ? (
        <>
          <Subtitulo>
            Nenhuma operação tem o ponto de pesca cadastrado ainda. As condições aparecem
            aqui assim que um guia informar onde opera.
          </Subtitulo>
          <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
            <Text style={estilos.voltarTexto}>Voltar</Text>
          </Pressable>
        </>
      ) : !hoje ? null : (
        <>
          <Text style={estilos.ondeEQuando}>
            {dados?.local.nome}
            {ponto?.cidade ? ` · ${ponto.cidade}` : ''} ·{' '}
            {mar ? 'água salgada' : 'água doce'}
          </Text>

          {dados?.offline && (
            <View style={estilos.faixaOffline}>
              <Text style={estilos.faixaOfflineTexto}>
                Sem conexão. Mostrando a previsão de{' '}
                {dados.desatualizadoHaMinutos !== null && dados.desatualizadoHaMinutos < 120
                  ? `${dados.desatualizadoHaMinutos} minutos atrás`
                  : 'algumas horas atrás'}
                .
              </Text>
            </View>
          )}

          {/* --- 1. alertas, ANTES da nota --- */}
          {hoje.alertas.length > 0 && (
            <View style={estilos.alertas}>
              {hoje.alertas.map((a) => (
                <View
                  key={a.chave}
                  style={[estilos.alerta, a.nivel === 'perigo' ? estilos.alertaPerigo : estilos.alertaAviso]}
                >
                  <Text style={estilos.alertaIcone}>{a.nivel === 'perigo' ? '⛔' : '⚠️'}</Text>
                  <Text style={estilos.alertaTexto}>{a.texto}</Text>
                </View>
              ))}
            </View>
          )}

          {/* --- 2. o índice --- */}
          {/* Respira só quando dá para sair. Num dia de perigo, pulsação seria
              exatamente o sinal errado. */}
          <Respirar ativo={hoje.indice.nota >= 40}>
          <View style={[estilos.cartaoIndice, { borderColor: corDaNota(hoje.indice.nota, cores) }]}>
            <Text style={[estilos.indiceRotulo, { color: corDaNota(hoje.indice.nota, cores) }]}>
              {hoje.indice.rotulo}
            </Text>
            <View style={estilos.linhaNota}>
              <NumeroVivo valor={hoje.indice.nota} estilo={estilos.indiceNota} />
              <Text style={estilos.indiceDe}> / 100</Text>
            </View>
            <Text style={estilos.estrelas}>
              {'★'.repeat(hoje.indice.estrelas)}
              <Text style={estilos.estrelasVazias}>{'☆'.repeat(5 - hoje.indice.estrelas)}</Text>
            </Text>
            <Text style={estilos.atividade}>Atividade dos peixes: {hoje.atividade.rotulo}</Text>
          </View>
          </Respirar>

          {/* --- 3. resumo --- */}
          <Surgir atraso={120}>
            <Text style={estilos.resumo}>{hoje.resumo}</Text>
          </Surgir>

          {/* --- o que mais pesa hoje --- */}
          <Secao titulo="O que mais pesa hoje" cores={cores}>
            {hoje.indice.fatores.slice(0, 4).map((f, i) => (
              <View key={f.chave} style={estilos.linhaFator}>
                <View style={estilos.fatorTopo}>
                  <Text style={estilos.fatorNome}>{f.nome}</Text>
                  <Text style={[estilos.fatorNota, { color: corDaNota(f.nota, cores) }]}>
                    {Math.round(f.nota)}
                  </Text>
                </View>
                <BarraViva
                  fracao={f.nota / 100}
                  cor={corDaNota(f.nota, cores)}
                  cores={cores}
                  atraso={i * 90}
                />
                <Text style={estilos.fatorExplicacao}>{f.explicacao}</Text>
              </View>
            ))}
          </Secao>

          {/* --- 4. melhor horário --- */}
          <Secao titulo="Melhor horário" cores={cores}>
            {hoje.melhorJanela && (
              <Text style={estilos.destaque}>
                Pico entre {hhmm(hoje.melhorJanela.inicio)} e {hhmm(hoje.melhorJanela.fim)}
              </Text>
            )}
            <View style={estilos.timeline}>
              {hoje.horas
                .filter((h) => h.instante.getHours() >= 4 && h.instante.getHours() <= 21)
                .map((h) => {
                  const noPico =
                    hoje.melhorJanela !== null &&
                    h.instante >= hoje.melhorJanela.inicio &&
                    h.instante < hoje.melhorJanela.fim;
                  return (
                    <View key={h.instante.toISOString()} style={estilos.colunaHora}>
                      <ColunaViva
                        altura={Math.max(4, h.indice.nota * 0.7)}
                        cor={corDaNota(h.indice.nota, cores)}
                        opacidade={noPico ? 1 : 0.55}
                        atraso={indiceDaHora(h.instante) * 28}
                      />
                      <Text style={estilos.colunaHoraTexto}>
                        {String(h.instante.getHours()).padStart(2, '0')}
                      </Text>
                    </View>
                  );
                })}
            </View>
          </Secao>

          {/* --- 5. agora --- */}
          {hoje.agora && (
            <Secao titulo="Agora" cores={cores}>
              <Grade
                cores={cores}
                itens={[
                  ['Temperatura', numero(hoje.agora.temperaturaC, 0, ' °C')],
                  ['Sensação', numero(hoje.agora.sensacaoC, 0, ' °C')],
                  ['Vento', hoje.agora.ventoNos === null ? '—'
                    : `${dec(hoje.agora.ventoNos, 0)} nós${hoje.agora.ventoDirecao !== null ? ` ${rumo(hoje.agora.ventoDirecao)}` : ''}`],
                  ['Rajadas', numero(hoje.agora.rajadaNos, 0, ' nós')],
                  ['Pressão', hoje.agora.pressaoHpa === null ? '—'
                    : `${dec(hoje.agora.pressaoHpa, 0)} hPa${
                        hoje.agora.tendenciaPressao === 'subindo' ? ' ↑'
                        : hoje.agora.tendenciaPressao === 'caindo' ? ' ↓'
                        : hoje.agora.tendenciaPressao === 'estavel' ? ' →' : ''}`],
                  ['Umidade', numero(hoje.agora.umidade, 0, '%')],
                  ['Nuvens', numero(hoje.agora.nuvens, 0, '%')],
                  ['Índice UV', numero(hoje.agora.uv, 0)],
                  ['Visibilidade', numero(hoje.agora.visibilidadeKm, 0, ' km')],
                  ['Chance de chuva', numero(hoje.agora.chanceChuva, 0, '%')],
                  ['Chuva prevista', numero(hoje.agora.chuvaMm, 1, ' mm')],
                ]}
              />
            </Secao>
          )}

          {/* --- 6. mar: só onde existe mar --- */}
          {mar && hoje.agora && hoje.agora.ondaM !== null && (
            <Secao titulo="Mar" cores={cores}>
              <Text style={estilos.destaque}>{NOME_DO_MAR[estadoDoMar(hoje.agora.ondaM)]}</Text>
              <Grade
                cores={cores}
                itens={[
                  ['Altura das ondas', numero(hoje.agora.ondaM, 1, ' m')],
                  ['Período', numero(hoje.agora.ondaPeriodoS, 0, ' s')],
                  ['Direção', hoje.agora.ondaDirecao === null ? '—' : rumo(hoje.agora.ondaDirecao)],
                  ['Temperatura da água', numero(hoje.agora.aguaC, 1, ' °C')],
                  ['Corrente', numero(hoje.agora.correnteNos, 1, ' nós')],
                  ['Direção da corrente', hoje.agora.correnteDirecao === null ? '—' : rumo(hoje.agora.correnteDirecao)],
                ]}
              />
            </Secao>
          )}

          {/* --- 7. maré: só onde existe maré --- */}
          {mar && hoje.mares.length > 0 && (
            <Secao titulo="Maré" cores={cores}>
              {hoje.mare && (
                <Text style={estilos.destaque}>
                  {hoje.mare.movimento === 'enchendo' ? 'Enchendo' : hoje.mare.movimento === 'vazando' ? 'Vazando' : 'Sem movimento definido'}
                  {hoje.mare.proximo
                    ? ` · ${hoje.mare.proximo.tipo === 'preamar' ? 'preamar' : 'baixa-mar'} às ${hhmm(hoje.mare.proximo.instante)}`
                    : ''}
                </Text>
              )}
              {hoje.mares.map((m) => (
                <View key={m.instante.toISOString()} style={estilos.linhaMare}>
                  <Text style={estilos.mareTipo}>
                    {m.tipo === 'preamar' ? '▲ Preamar' : '▼ Baixa-mar'}
                  </Text>
                  <Text style={estilos.mareHora}>{hhmm(m.instante)}</Text>
                  <Text style={estilos.mareAltura}>{dec(m.alturaM, 2)} m</Text>
                </View>
              ))}
              <Text style={estilos.rodapeSecao}>
                Alturas em relação ao nível médio do mar, derivadas do modelo de previsão.
                Para navegação em baixio, consulte a tábua da Marinha.
              </Text>
            </Secao>
          )}

          {/* --- 8. sol --- */}
          <Secao titulo="Sol" cores={cores}>
            <Grade
              cores={cores}
              itens={[
                ['Nascer', hhmm(hoje.sol.nascer)],
                ['Pôr', hhmm(hoje.sol.por)],
                ['Hora dourada (manhã)', hoje.sol.douradaManha ? `${hhmm(hoje.sol.douradaManha[0])}–${hhmm(hoje.sol.douradaManha[1])}` : '—'],
                ['Hora dourada (tarde)', hoje.sol.douradaTarde ? `${hhmm(hoje.sol.douradaTarde[0])}–${hhmm(hoje.sol.douradaTarde[1])}` : '—'],
                ['Hora azul (manhã)', hoje.sol.azulManha ? `${hhmm(hoje.sol.azulManha[0])}–${hhmm(hoje.sol.azulManha[1])}` : '—'],
                ['Duração do dia', `${Math.floor(hoje.sol.duracaoMinutos / 60)}h${String(hoje.sol.duracaoMinutos % 60).padStart(2, '0')}`],
              ]}
            />
          </Secao>

          {/* --- 9. lua --- */}
          <Secao titulo="Lua" cores={cores}>
            <View style={estilos.luaLinha}>
              <FaseDaLua fracao={hoje.lua.fracao} cores={cores} />
              <View style={estilos.luaTextos}>
                <Text style={estilos.destaque}>{NOME_DA_FASE[hoje.lua.fase]}</Text>
                <Text style={estilos.rodapeSecao}>
                  {(hoje.lua.iluminacao * 100).toFixed(0)}% iluminada ·{' '}
                  {dec(hoje.lua.idadeDias, 1)} dias
                </Text>
                <Text style={estilos.rodapeSecao}>
                  Nasce {hhmm(hoje.lua.nascer)} · Se põe {hhmm(hoje.lua.ocaso)}
                </Text>
              </View>
            </View>
          </Secao>

          {/* --- 10. espécies --- */}
          <Secao titulo="Chance por espécie" cores={cores}>
            {hoje.especies.slice(0, 6).map((f) => (
              <View key={f.especie.chave} style={estilos.linhaEspecie}>
                <View style={estilos.especieTopo}>
                  <Text style={estilos.especieNome}>{f.especie.nome}</Text>
                  <Text style={[estilos.especieEstrelas, { color: corDaNota(f.nota, cores) }]}>
                    {'★'.repeat(f.estrelas)}
                    <Text style={estilos.estrelasVazias}>{'☆'.repeat(5 - f.estrelas)}</Text>
                  </Text>
                </View>
                <Text style={estilos.especiePorque}>{f.porque}</Text>
              </View>
            ))}
          </Secao>

          {/* --- 11. sete dias --- */}
          <Secao titulo="Próximos dias" cores={cores}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dados?.dias.map((d, i) => (
                <Pressable
                  key={d.dia.toISOString()}
                  onPress={() => setDiaAberto(i)}
                  style={[estilos.cartaoDia, i === diaAberto && { borderColor: cores.acento }]}
                >
                  <Text style={estilos.cartaoDiaData}>{i === 0 ? 'Hoje' : diaCurto(d.dia)}</Text>
                  <Text style={[estilos.cartaoDiaNota, { color: corDaNota(d.indice.nota, cores) }]}>
                    {d.indice.nota}
                  </Text>
                  <Text style={estilos.cartaoDiaDetalhe}>
                    {numero(d.agora?.ventoNos, 0, ' nós')}
                  </Text>
                  {d.agora?.ondaM !== null && d.agora?.ondaM !== undefined && (
                    <Text style={estilos.cartaoDiaDetalhe}>{dec(d.agora.ondaM, 1)} m</Text>
                  )}
                  <Text style={estilos.cartaoDiaDetalhe}>
                    {numero(d.agora?.temperaturaC, 0, '°')}
                  </Text>
                  {d.alertas.some((a) => a.nivel === 'perigo') && (
                    <Text style={estilos.cartaoDiaAlerta}>⛔</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Secao>

          {/* --- 12. recomendação --- */}
          <View style={estilos.recomendacao}>
            <Text style={estilos.recomendacaoTitulo}>Recomendação do dia</Text>
            <Text style={estilos.recomendacaoTexto}>{hoje.recomendacao}</Text>
          </View>

          <Text style={estilos.fonte}>
            Previsão: {dados?.fonte}. O índice é uma leitura das condições, não uma garantia
            de pescaria — e nenhuma nota substitui o seu julgamento no cais.
          </Text>

          <Vitrine />
        </>
      )}

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

// -----------------------------------------------------------------------------
// Peças
// -----------------------------------------------------------------------------

function Secao({ titulo, cores, children }: { titulo: string; cores: Cores; children: React.ReactNode }) {
  const e = criarEstilos(cores);
  return (
    <View style={e.secao}>
      <Text style={e.secaoTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function Grade({ cores, itens }: { cores: Cores; itens: Array<[string, string]> }) {
  const e = criarEstilos(cores);
  return (
    <View style={e.grade}>
      {itens.map(([rotulo, valor]) => (
        <View key={rotulo} style={e.celula}>
          <Text style={e.celulaRotulo}>{rotulo}</Text>
          <Text style={e.celulaValor}>{valor}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A lua desenhada com dois círculos sobrepostos.
 *
 * Sem biblioteca de gráfico: a forma é simples o bastante, e uma dependência a
 * mais custaria uma compilação nova na Expo para desenhar um disco.
 */
function FaseDaLua({ fracao, cores }: { fracao: number; cores: Cores }) {
  const crescendo = fracao < 0.5;
  const iluminado = 1 - Math.abs(fracao - 0.5) * 2; // 0 na nova, 1 na cheia
  const tamanho = 56;
  return (
    <View
      style={{
        width: tamanho, height: tamanho, borderRadius: tamanho / 2,
        backgroundColor: cores.superficieAlta, borderWidth: 1, borderColor: cores.borda,
        overflow: 'hidden', justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: tamanho * iluminado,
          height: tamanho,
          backgroundColor: cores.acento,
          left: crescendo ? tamanho - tamanho * iluminado : 0,
          opacity: 0.85,
        }}
      />
    </View>
  );
}

function Esqueleto({ cores }: { cores: Cores }) {
  const e = criarEstilos(cores);
  return (
    <View>
      {[120, 60, 90, 140].map((h, i) => (
        <View key={i} style={[e.esqueleto, { height: h }]} />
      ))}
    </View>
  );
}

/** Verde, azul, amarelo, laranja, vermelho — a escala pedida. */
function corDaNota(nota: number, cores: Cores): string {
  if (nota >= 80) return cores.acento;
  if (nota >= 60) return cores.acento;
  if (nota >= 40) return cores.aviso;
  if (nota >= 20) return cores.aviso;
  return cores.erro;
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 20, paddingBottom: 64 },
    chips: { marginBottom: 12 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      borderWidth: 1, borderColor: cores.borda, marginRight: 8,
    },
    chipAtivo: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
    chipTexto: { color: cores.textoSuave, fontWeight: '600', fontSize: 13 },
    chipTextoAtivo: { color: cores.acento },
    ondeEQuando: { color: cores.textoSuave, fontSize: 13, marginBottom: 14 },

    faixaOffline: {
      borderWidth: 1, borderColor: cores.aviso, borderRadius: 10,
      padding: 10, marginBottom: 14,
    },
    faixaOfflineTexto: { color: cores.texto, fontSize: 13, lineHeight: 18 },

    alertas: { marginBottom: 14, gap: 8 },
    alerta: { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 12, borderWidth: 1 },
    alertaPerigo: { borderColor: cores.erro, backgroundColor: cores.superficieAlta },
    alertaAviso: { borderColor: cores.aviso },
    alertaIcone: { fontSize: 15 },
    alertaTexto: { color: cores.texto, flex: 1, lineHeight: 19, fontWeight: '600' },

    cartaoIndice: {
      borderWidth: 2, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16,
    },
    indiceRotulo: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
    linhaNota: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
    indiceNota: { fontSize: 52, fontWeight: '800', color: cores.texto },
    indiceDe: { fontSize: 18, fontWeight: '600', color: cores.textoSuave },
    estrelas: { fontSize: 22, color: cores.acento, letterSpacing: 3, marginTop: 2 },
    estrelasVazias: { color: cores.borda },
    atividade: { color: cores.textoSuave, fontSize: 13, marginTop: 8 },

    resumo: { color: cores.texto, fontSize: 15, lineHeight: 23, marginBottom: 20 },

    secao: {
      borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 18, marginBottom: 18,
    },
    secaoTitulo: {
      fontSize: 12, fontWeight: '800', color: cores.textoSuave,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
    },
    destaque: { color: cores.texto, fontSize: 16, fontWeight: '700', marginBottom: 10 },
    rodapeSecao: { color: cores.textoSuave, fontSize: 12, lineHeight: 17, marginTop: 6 },

    linhaFator: { marginBottom: 14 },
    fatorTopo: { flexDirection: 'row', justifyContent: 'space-between' },
    fatorNome: { color: cores.texto, fontWeight: '600', fontSize: 14 },
    fatorNota: { fontWeight: '800', fontSize: 14 },
    barraFundo: {
      height: 6, borderRadius: 3, backgroundColor: cores.superficieAlta, marginTop: 6,
      overflow: 'hidden',
    },
    barra: { height: 6, borderRadius: 3 },
    fatorExplicacao: { color: cores.textoSuave, fontSize: 12, marginTop: 5, lineHeight: 17 },

    timeline: {
      flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
      height: 90, marginTop: 4,
    },
    colunaHora: { alignItems: 'center', flex: 1 },
    colunaBarra: { width: 7, borderRadius: 4 },
    colunaHoraTexto: { color: cores.textoSuave, fontSize: 9, marginTop: 4 },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    celula: {
      minWidth: '30%', flexGrow: 1, borderWidth: 1, borderColor: cores.borda,
      borderRadius: 10, padding: 10,
    },
    celulaRotulo: { color: cores.textoSuave, fontSize: 11 },
    celulaValor: { color: cores.texto, fontSize: 16, fontWeight: '700', marginTop: 3 },

    linhaMare: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: cores.borda,
    },
    mareTipo: { color: cores.texto, fontWeight: '600', fontSize: 14, flex: 1 },
    mareHora: { color: cores.texto, fontWeight: '700', fontSize: 15 },
    mareAltura: { color: cores.textoSuave, fontSize: 13, width: 70, textAlign: 'right' },

    luaLinha: { flexDirection: 'row', gap: 16, alignItems: 'center' },
    luaTextos: { flex: 1 },

    linhaEspecie: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: cores.borda },
    especieTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    especieNome: { color: cores.texto, fontWeight: '600', fontSize: 15 },
    especieEstrelas: { fontSize: 15, letterSpacing: 2 },
    especiePorque: { color: cores.textoSuave, fontSize: 12, marginTop: 3 },

    cartaoDia: {
      borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12,
      marginRight: 8, alignItems: 'center', minWidth: 86,
    },
    cartaoDiaData: { color: cores.textoSuave, fontSize: 11, fontWeight: '700' },
    cartaoDiaNota: { fontSize: 24, fontWeight: '800', marginVertical: 4 },
    cartaoDiaDetalhe: { color: cores.textoSuave, fontSize: 11 },
    cartaoDiaAlerta: { fontSize: 12, marginTop: 4 },

    recomendacao: {
      borderWidth: 1, borderColor: cores.acento, backgroundColor: cores.acentoSuave,
      borderRadius: 14, padding: 16, marginTop: 8,
    },
    recomendacaoTitulo: { color: cores.acento, fontWeight: '800', fontSize: 13, marginBottom: 6 },
    recomendacaoTexto: { color: cores.texto, fontSize: 15, lineHeight: 23 },

    fonte: { color: cores.textoSuave, fontSize: 11, lineHeight: 16, marginTop: 18 },

    esqueleto: {
      backgroundColor: cores.superficieAlta, borderRadius: 12, marginBottom: 12, opacity: 0.6,
    },

    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
