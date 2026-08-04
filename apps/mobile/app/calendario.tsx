/**
 * O calendário: a agenda do guia e a agenda da plataforma, na mesma tela.
 *
 * A diferença entre os dois é o que o BANCO devolve, não o que esta tela pede.
 * O guia recebe os próprios barcos; o master, todos, com o nome da operação em
 * cada saída e um filtro para estreitar num guia só. Se a separação vivesse
 * aqui, bastaria um `curl` para pular por cima dela.
 *
 * POR QUE NÃO TEM GRADE DE HORAS, como o Google Agenda:
 *
 * Uma pescaria ocupa o dia. Não guardamos hora de saída — o combinado vai na
 * observação do dia, em texto. Desenhar faixas horárias inventaria uma precisão
 * que o dado não tem, e a primeira pergunta seria "por que está marcado às 8h
 * se saímos às 5h?". Então: mês em grade, semana em faixa, dia em detalhe.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import {
  DIAS_DA_SEMANA,
  deslocar,
  diasDaSemana,
  gradeDoMes,
  hoje,
  intervaloVisivel,
  mesDe,
  paraBR,
  rotulo,
  type Vista,
} from '@pescavertical/core/periodo';
import { useAuth } from '@/lib/auth';
import {
  agenda,
  estadoDa,
  guiasComAgenda,
  porData,
  resumir,
  type EstadoDoDia,
  type GuiaDoFiltro,
  type LinhaDaAgenda,
} from '@/lib/agenda';
import { mensagemDeErro } from '@/lib/erros';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

const VISTAS: { chave: Vista; nome: string }[] = [
  { chave: 'mes', nome: 'Mês' },
  { chave: 'semana', nome: 'Semana' },
  { chave: 'dia', nome: 'Dia' },
];

/** Na legenda cabe explicar; no selo, ao lado do nome do barco, não. */
const ROTULO_ESTADO: Record<EstadoDoDia, string> = {
  confirmada: 'Reservado',
  pendente: 'Aguardando pagamento',
  aberto: 'Livre',
  bloqueado: 'Bloqueado',
};

const SELO_ESTADO: Record<EstadoDoDia, string> = {
  confirmada: 'Reservado',
  pendente: 'A pagar',
  aberto: 'Livre',
  bloqueado: 'Bloqueado',
};

const ROTULO_PAGAMENTO: Record<string, string> = {
  aguardando_sinal: 'sinal não pago',
  sinal_pago: 'sinal pago',
  quitada: 'tudo pago',
};

export default function Calendario() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { perfil } = useAuth();

  const master = perfil?.role === 'master';

  const [vista, setVista] = useState<Vista>('mes');
  const [ancora, setAncora] = useState(hoje());
  const [guiaFiltro, setGuiaFiltro] = useState<string | null>(null);
  const [guias, setGuias] = useState<GuiaDoFiltro[]>([]);
  const [linhas, setLinhas] = useState<LinhaDaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const { de, ate } = intervaloVisivel(vista, ancora);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await agenda(de, ate, guiaFiltro));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar a agenda.'));
    } finally {
      setCarregando(false);
    }
  }, [de, ate, guiaFiltro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!master) return;
    // Lista vazia para quem não é master; falhar aqui não pode derrubar a
    // agenda, que é o que a pessoa veio ver.
    guiasComAgenda().then(setGuias).catch(() => {});
  }, [master]);

  const mapa = porData(linhas);
  const resumo = resumir(linhas);
  const oHoje = hoje();

  function abrirDia(d: string) {
    setAncora(d);
    setVista('dia');
  }

  // ---------------------------------------------------------------- mês -----
  function Mes() {
    const semanas = gradeDoMes(ancora);
    const mesAtual = mesDe(ancora);

    return (
      <View style={estilos.grade}>
        <View style={estilos.cabecalhoSemana}>
          {DIAS_DA_SEMANA.map((d, i) => (
            <Text key={i} style={estilos.cabecalhoDia}>
              {d}
            </Text>
          ))}
        </View>

        {semanas.map((semana) => (
          <View key={semana[0]} style={estilos.linhaSemana}>
            {semana.map((d) => {
              const doMes = mesDe(d) === mesAtual;
              const saidas = mapa[d] ?? [];
              return (
                <Pressable
                  key={d}
                  onPress={() => abrirDia(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${paraBR(d)}, ${saidas.length} saída(s)`}
                  style={[estilos.celula, d === oHoje && estilos.celulaHoje]}
                >
                  <Text
                    style={[
                      estilos.numeroDia,
                      !doMes && estilos.numeroForaDoMes,
                      d === oHoje && estilos.numeroHoje,
                    ]}
                  >
                    {Number(d.slice(8))}
                  </Text>
                  {saidas.slice(0, 2).map((l) => (
                    <View
                      key={`${l.boat_id}-${l.booking_id ?? 'livre'}`}
                      style={[estilos.pastilha, estiloDoEstado(estadoDa(l))]}
                    />
                  ))}
                  {saidas.length > 2 && (
                    <Text style={estilos.maisSaidas}>+{saidas.length - 2}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={estilos.legenda}>
          {(['confirmada', 'pendente', 'aberto'] as EstadoDoDia[]).map((e) => (
            <View key={e} style={estilos.legendaItem}>
              <View style={[estilos.pastilhaLegenda, estiloDoEstado(e)]} />
              <Text style={estilos.legendaTexto}>{ROTULO_ESTADO[e]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------- semana -----
  function Semana() {
    const dias = diasDaSemana(ancora);
    return (
      <>
        <View style={estilos.faixa}>
          {dias.map((d, i) => {
            const saidas = mapa[d] ?? [];
            return (
              <Pressable
                key={d}
                onPress={() => abrirDia(d)}
                accessibilityRole="button"
                accessibilityLabel={`${paraBR(d)}, ${saidas.length} saída(s)`}
                style={[estilos.faixaDia, d === oHoje && estilos.faixaDiaHoje]}
              >
                <Text style={estilos.faixaInicial}>{DIAS_DA_SEMANA[i]}</Text>
                <Text style={[estilos.faixaNumero, d === oHoje && estilos.numeroHoje]}>
                  {Number(d.slice(8))}
                </Text>
                <View style={estilos.faixaPontos}>
                  {saidas.slice(0, 3).map((l) => (
                    <View
                      key={`${l.boat_id}-${l.booking_id ?? 'livre'}`}
                      style={[estilos.ponto, estiloDoEstado(estadoDa(l))]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Lista dias={dias} />
      </>
    );
  }

  // ------------------------------------------------------ lista de saídas -----
  function Lista({ dias }: { dias: string[] }) {
    const comSaida = dias.filter((d) => (mapa[d] ?? []).length > 0);

    if (carregando) return <Text style={estilos.vazio}>Carregando…</Text>;
    if (comSaida.length === 0) {
      return (
        <Text style={estilos.vazio}>
          {master
            ? 'Nenhuma saída neste período em nenhuma operação.'
            : 'Nenhuma saída neste período. Abra datas em “Meus barcos”.'}
        </Text>
      );
    }

    return (
      <>
        {comSaida.map((d) => (
          <View key={d} style={estilos.diaBloco}>
            <Text style={estilos.diaData}>{paraBR(d)}</Text>
            {(mapa[d] ?? []).map((l) => {
              const estado = estadoDa(l);
              return (
                <View key={`${l.boat_id}-${l.booking_id ?? 'livre'}`} style={estilos.saida}>
                  <View style={estilos.saidaTopo}>
                    <Text style={estilos.barco}>
                      {l.barco_nome}
                      {master ? <Text style={estilos.operacao}> · {l.guia_nome}</Text> : null}
                    </Text>
                    <Text style={[estilos.selo, seloDoEstado(estado)]}>
                      {SELO_ESTADO[estado]}
                    </Text>
                  </View>

                  {l.booking_id ? (
                    <>
                      <Text style={estilos.detalhe}>
                        {l.cliente_nome ?? 'Cliente'} · {l.qtd_pescadores}{' '}
                        {l.qtd_pescadores === 1 ? 'pescador' : 'pescadores'}
                        {l.cliente_telefone ? ` · ${l.cliente_telefone}` : ''}
                      </Text>
                      <Text style={estilos.detalhe}>
                        Total {formatarBRL(l.valor_liquido_centavos ?? 0)} ·{' '}
                        {master
                          ? `comissão ${formatarBRL(l.comissao_centavos ?? 0)}`
                          : `sua parte ${formatarBRL(l.repasse_guia_centavos ?? 0)}`}
                      </Text>
                      {/* Só o que está em aberto vai de vermelho. Pintar a linha
                          inteira faz o valor já quitado parecer problema. */}
                      <Text style={estilos.dinheiro}>
                        Quitado {formatarBRL(l.valor_pago_centavos ?? 0)} · em aberto{' '}
                        <Text
                          style={(l.valor_aberto_centavos ?? 0) > 0 ? estilos.emAberto : undefined}
                        >
                          {formatarBRL(l.valor_aberto_centavos ?? 0)}
                        </Text>
                        {l.status_pagamento ? ` (${ROTULO_PAGAMENTO[l.status_pagamento]})` : ''}
                      </Text>
                    </>
                  ) : (
                    <Text style={estilos.detalhe}>
                      {(l.preco_barco_centavos ?? 0) > 0 &&
                        `${formatarBRL(l.preco_barco_centavos ?? 0)} o dia`}
                      {(l.preco_barco_centavos ?? 0) > 0 &&
                        (l.preco_passageiro_centavos ?? 0) > 0 &&
                        ' + '}
                      {(l.preco_passageiro_centavos ?? 0) > 0 &&
                        `${formatarBRL(l.preco_passageiro_centavos ?? 0)} por pescador`}
                    </Text>
                  )}
                  {l.observacao ? <Text style={estilos.obs}>{l.observacao}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
      </>
    );
  }

  function estiloDoEstado(e: EstadoDoDia) {
    return {
      confirmada: estilos.estadoConfirmada,
      pendente: estilos.estadoPendente,
      aberto: estilos.estadoAberto,
      bloqueado: estilos.estadoBloqueado,
    }[e];
  }

  function seloDoEstado(e: EstadoDoDia) {
    return {
      confirmada: estilos.seloConfirmada,
      pendente: estilos.seloPendente,
      aberto: estilos.seloAberto,
      bloqueado: estilos.seloAberto,
    }[e];
  }

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 28 }]}>
      <Titulo>{master ? 'Agenda da plataforma' : 'Minha agenda'}</Titulo>
      <Subtitulo>
        {master
          ? 'Todas as operações aprovadas, no período que você escolher.'
          : 'Todos os seus barcos, no período que você escolher.'}
      </Subtitulo>

      {master && guias.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={estilos.filtros}
        >
          {[{ id: null, nome_operacao: 'Todas' }, ...guias].map((g) => {
            const ativo = guiaFiltro === g.id;
            return (
              <Pressable
                key={g.id ?? 'todas'}
                onPress={() => setGuiaFiltro(g.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
                style={[estilos.filtro, ativo && estilos.filtroAtivo]}
              >
                <Text style={[estilos.filtroTexto, ativo && estilos.filtroTextoAtivo]}>
                  {g.nome_operacao}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={estilos.abas}>
        {VISTAS.map((v) => (
          <Pressable
            key={v.chave}
            onPress={() => setVista(v.chave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: vista === v.chave }}
            style={[estilos.aba, vista === v.chave && estilos.abaAtiva]}
          >
            <Text style={[estilos.abaTexto, vista === v.chave && estilos.abaTextoAtivo]}>
              {v.nome}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={estilos.navegacao}>
        <Pressable
          onPress={() => setAncora(deslocar(vista, ancora, -1))}
          accessibilityRole="button"
          accessibilityLabel="Período anterior"
          style={estilos.seta}
        >
          <Text style={estilos.setaTexto}>‹</Text>
        </Pressable>
        <Text style={estilos.periodo}>{rotulo(vista, ancora)}</Text>
        <Pressable
          onPress={() => setAncora(deslocar(vista, ancora, 1))}
          accessibilityRole="button"
          accessibilityLabel="Próximo período"
          style={estilos.seta}
        >
          <Text style={estilos.setaTexto}>›</Text>
        </Pressable>
      </View>

      {ancora !== oHoje && (
        <Pressable onPress={() => setAncora(oHoje)} style={estilos.voltarHoje}>
          <Text style={estilos.link}>Voltar para hoje</Text>
        </Pressable>
      )}

      <Erro mensagem={erro} />

      {vista === 'mes' && <Mes />}
      {vista === 'semana' && <Semana />}
      {vista === 'dia' && <Lista dias={[ancora]} />}

      <View style={estilos.resumo}>
        <Text style={estilos.resumoTitulo}>
          {vista === 'mes' ? 'No mês' : vista === 'semana' ? 'Na semana' : 'No dia'}
        </Text>
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Reservados · livres</Text>
          <Text style={estilos.resumoValor}>
            {resumo.reservados} · {resumo.livres}
          </Text>
        </View>
        <View style={estilos.divisoria} />
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>
            {master ? 'Comissão da plataforma' : 'Sua parte'}
          </Text>
          <Text style={estilos.resumoValor}>
            {formatarBRL(master ? resumo.comissao : resumo.aReceber)}
          </Text>
        </View>
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Já quitado pelos clientes</Text>
          <Text style={estilos.resumoValor}>{formatarBRL(resumo.recebido)}</Text>
        </View>
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Ainda em aberto</Text>
          <Text style={[estilos.resumoValor, resumo.emAberto > 0 && estilos.emAberto]}>
            {formatarBRL(resumo.emAberto)}
          </Text>
        </View>
      </View>

      {!master && (
        <Pressable onPress={() => router.push('/barcos')} style={estilos.acao}>
          <Text style={estilos.acaoTexto}>Meus barcos</Text>
          <Text style={estilos.acaoNota}>Cadastrar barco, abrir datas e definir preços</Text>
        </Pressable>
      )}

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 20, paddingBottom: 64 },

    filtros: { gap: 8, paddingBottom: 16 },
    filtro: {
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    filtroAtivo: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
    filtroTexto: { fontSize: 13, fontWeight: '600', color: cores.textoSuave },
    filtroTextoAtivo: { color: cores.acento },

    abas: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    aba: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: cores.borda,
      alignItems: 'center',
    },
    abaAtiva: { backgroundColor: cores.acentoSuave, borderColor: cores.acento },
    abaTexto: { fontWeight: '600', color: cores.textoSuave },
    abaTextoAtivo: { color: cores.acento },

    navegacao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    seta: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: cores.borda,
      alignItems: 'center',
      justifyContent: 'center',
    },
    setaTexto: { fontSize: 24, color: cores.acento, lineHeight: 28 },
    periodo: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: cores.texto },
    voltarHoje: { alignItems: 'center', marginTop: 10 },
    link: { color: cores.acento, fontWeight: '600' },

    // --- grade do mês ---
    grade: { marginTop: 18 },
    cabecalhoSemana: { flexDirection: 'row', marginBottom: 6 },
    cabecalhoDia: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 0.5,
    },
    linhaSemana: { flexDirection: 'row', gap: 4, marginBottom: 4 },
    celula: {
      flex: 1,
      minHeight: 62,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      paddingTop: 5,
      paddingHorizontal: 4,
      paddingBottom: 5,
      alignItems: 'center',
      gap: 3,
    },
    celulaHoje: { borderColor: cores.acento, borderWidth: 2 },
    numeroDia: { fontSize: 13, fontWeight: '600', color: cores.texto },
    // Dia de mês vizinho continua clicável e continua mostrando saída: só perde
    // peso. Escondê-lo criaria um buraco na grade.
    numeroForaDoMes: { color: cores.textoSuave, opacity: 0.55 },
    numeroHoje: { color: cores.acento, fontWeight: '800' },
    pastilha: { alignSelf: 'stretch', height: 5, borderRadius: 3, borderWidth: 1 },
    maisSaidas: { fontSize: 9, color: cores.textoSuave, fontWeight: '700' },

    estadoConfirmada: { backgroundColor: cores.acento, borderColor: cores.acento },
    estadoPendente: { backgroundColor: cores.aviso, borderColor: cores.aviso },
    estadoAberto: { backgroundColor: 'transparent', borderColor: cores.textoSuave },
    estadoBloqueado: { backgroundColor: cores.superficieAlta, borderColor: cores.borda },

    legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
    legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pastilhaLegenda: { width: 16, height: 5, borderRadius: 3, borderWidth: 1 },
    legendaTexto: { fontSize: 11, color: cores.textoSuave },

    // --- faixa da semana ---
    faixa: { flexDirection: 'row', gap: 4, marginTop: 18, marginBottom: 8 },
    faixaDia: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      paddingVertical: 9,
      alignItems: 'center',
      gap: 4,
    },
    faixaDiaHoje: { borderColor: cores.acento, borderWidth: 2 },
    faixaInicial: { fontSize: 10, fontWeight: '700', color: cores.textoSuave },
    faixaNumero: { fontSize: 15, fontWeight: '700', color: cores.texto },
    faixaPontos: { flexDirection: 'row', gap: 3, minHeight: 6 },
    ponto: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },

    // --- lista ---
    diaBloco: { marginTop: 18 },
    diaData: { fontSize: 15, fontWeight: '700', color: cores.texto, marginBottom: 8 },
    saida: {
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    saidaTopo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    barco: { fontSize: 16, fontWeight: '700', color: cores.texto, flexShrink: 1 },
    operacao: { fontSize: 13, fontWeight: '600', color: cores.textoSuave },
    selo: {
      fontSize: 11,
      flexShrink: 0,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    seloConfirmada: { backgroundColor: cores.acentoSuave, color: cores.acento },
    seloPendente: { backgroundColor: cores.superficieAlta, color: cores.aviso },
    seloAberto: { backgroundColor: cores.superficieAlta, color: cores.textoSuave },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 5 },
    dinheiro: { fontSize: 13, color: cores.texto, marginTop: 5, fontWeight: '600' },
    emAberto: { color: cores.erro },
    obs: { fontSize: 12, color: cores.textoSuave, marginTop: 5, fontStyle: 'italic' },
    vazio: { color: cores.textoSuave, textAlign: 'center', lineHeight: 21, marginTop: 24 },

    // --- resumo ---
    resumo: {
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 15,
      marginTop: 24,
      gap: 6,
    },
    resumoTitulo: {
      fontSize: 10,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    resumoRotulo: { color: cores.textoSuave, fontSize: 14 },
    resumoValor: { color: cores.texto, fontSize: 15, fontWeight: '700' },
    divisoria: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },

    acao: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 14,
      padding: 16,
    },
    acaoTexto: { fontSize: 16, fontWeight: '700', color: cores.texto },
    acaoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 2 },
    voltar: { marginTop: 26, alignItems: 'center' },
    voltarTexto: { color: cores.textoSuave, fontWeight: '600' },
  });
