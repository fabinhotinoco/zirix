/**
 * A agenda do guia: semana, mês ou um dia específico.
 *
 * Todos os barcos juntos, e não um casco de cada vez, porque é assim que o guia
 * decide o dia dele — olhando tudo o que sai naquela data. A tela por barco
 * continua existindo para abrir datas e mexer em preço; esta é para enxergar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import {
  deslocar,
  hoje,
  intervalo,
  paraBR,
  rotulo,
  type Vista,
} from '@pescavertical/core/periodo';
import { agendaDoGuia, resumir, type LinhaDaAgenda } from '@/lib/agenda';
import { mensagemDeErro } from '@/lib/erros';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

const VISTAS: { chave: Vista; nome: string }[] = [
  { chave: 'semana', nome: 'Semana' },
  { chave: 'mes', nome: 'Mês' },
  { chave: 'dia', nome: 'Dia' },
];

const ROTULO_PAGAMENTO: Record<string, string> = {
  aguardando_sinal: 'sinal não pago',
  sinal_pago: 'sinal pago',
  quitada: 'tudo pago',
};

/** dd/mm/aaaa para o formato do banco, ou null se a data não existir. */
function dataDigitada(bruto: string): string | null {
  const m = bruto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

export default function MinhaAgenda() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [vista, setVista] = useState<Vista>('semana');
  const [ancora, setAncora] = useState(hoje());
  const [linhas, setLinhas] = useState<LinhaDaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [irPara, setIrPara] = useState('');

  const { de, ate } = intervalo(vista, ancora);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await agendaDoGuia(de, ate));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar sua agenda.'));
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = resumir(linhas);
  const isoDigitado = dataDigitada(irPara);

  // Uma data pode ter mais de um barco saindo. Agrupar evita repetir o
  // cabeçalho do dia e deixa claro o que acontece naquela data.
  const porDia = linhas.reduce<Record<string, LinhaDaAgenda[]>>((mapa, l) => {
    (mapa[l.data] ??= []).push(l);
    return mapa;
  }, {});
  const datas = Object.keys(porDia).sort();

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Titulo>Minha agenda</Titulo>
      <Subtitulo>Todos os seus barcos, no período que você escolher.</Subtitulo>

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

      {ancora !== hoje() && (
        <Pressable onPress={() => setAncora(hoje())} style={estilos.voltarHoje}>
          <Text style={estilos.link}>Voltar para hoje</Text>
        </Pressable>
      )}

      {vista === 'dia' && (
        <View style={estilos.irPara}>
          <TextInput
            style={estilos.campoData}
            value={irPara}
            onChangeText={setIrPara}
            placeholder="Ir para dd/mm/aaaa"
            placeholderTextColor={cores.textoSuave}
            keyboardType="number-pad"
          />
          <Pressable
            disabled={isoDigitado === null}
            onPress={() => {
              if (isoDigitado) {
                setAncora(isoDigitado);
                setIrPara('');
              }
            }}
            accessibilityRole="button"
            style={[estilos.irBotao, isoDigitado === null && estilos.irBotaoInativo]}
          >
            <Text style={[estilos.irTexto, isoDigitado === null && estilos.irTextoInativo]}>Ir</Text>
          </Pressable>
        </View>
      )}
      {vista === 'dia' && irPara !== '' && isoDigitado === null && (
        <Text style={estilos.dica}>Data inválida. Use dd/mm/aaaa.</Text>
      )}

      <Erro mensagem={erro} />

      <View style={estilos.resumo}>
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Dias com saída</Text>
          <Text style={estilos.resumoValor}>{resumo.dias}</Text>
        </View>
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Reservados · livres</Text>
          <Text style={estilos.resumoValor}>
            {resumo.reservados} · {resumo.livres}
          </Text>
        </View>
        <View style={estilos.divisoria} />
        <View style={estilos.resumoLinha}>
          <Text style={estilos.resumoRotulo}>Sua parte no período</Text>
          <Text style={estilos.resumoValor}>{formatarBRL(resumo.aReceber)}</Text>
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

      {carregando ? (
        <Text style={estilos.vazio}>Carregando…</Text>
      ) : datas.length === 0 ? (
        <Text style={estilos.vazio}>
          Nenhuma saída neste período. Abra datas em “Meus barcos”.
        </Text>
      ) : (
        datas.map((d) => (
          <View key={d} style={estilos.dia}>
            <Text style={estilos.diaData}>{paraBR(d)}</Text>
            {porDia[d].map((l) => (
              <View key={`${l.boat_id}-${l.booking_id ?? 'livre'}`} style={estilos.saida}>
                <View style={estilos.saidaTopo}>
                  <Text style={estilos.barco}>{l.barco_nome}</Text>
                  <Text
                    style={[
                      estilos.selo,
                      l.booking_id ? estilos.seloReservado : estilos.seloLivre,
                    ]}
                  >
                    {l.booking_id
                      ? l.reserva_status === 'confirmada'
                        ? 'Reservado'
                        : 'Aguardando pagamento'
                      : l.dia_status === 'bloqueado'
                        ? 'Bloqueado'
                        : 'Livre'}
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
                      Total {formatarBRL(l.valor_liquido_centavos ?? 0)} · sua parte{' '}
                      {formatarBRL(l.repasse_guia_centavos ?? 0)}
                    </Text>
                    {/* Só o que está em aberto vai de vermelho. Pintar a linha
                        inteira faz o valor já quitado parecer problema. */}
                    <Text style={estilos.dinheiro}>
                      Quitado {formatarBRL(l.valor_pago_centavos ?? 0)} · em aberto{' '}
                      <Text style={(l.valor_aberto_centavos ?? 0) > 0 ? estilos.emAberto : undefined}>
                        {formatarBRL(l.valor_aberto_centavos ?? 0)}
                      </Text>
                      {l.status_pagamento ? ` (${ROTULO_PAGAMENTO[l.status_pagamento]})` : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={estilos.detalhe}>
                    {l.preco_barco_centavos !== null && l.preco_barco_centavos > 0 &&
                      `${formatarBRL(l.preco_barco_centavos)} o dia`}
                    {l.preco_barco_centavos !== null &&
                      l.preco_barco_centavos > 0 &&
                      (l.preco_passageiro_centavos ?? 0) > 0 &&
                      ' + '}
                    {(l.preco_passageiro_centavos ?? 0) > 0 &&
                      `${formatarBRL(l.preco_passageiro_centavos ?? 0)} por pescador`}
                  </Text>
                )}
                {l.observacao ? <Text style={estilos.obs}>{l.observacao}</Text> : null}
              </View>
            ))}
          </View>
        ))
      )}

      <Pressable onPress={() => router.push('/barcos')} style={estilos.acao}>
        <Text style={estilos.acaoTexto}>Meus barcos</Text>
        <Text style={estilos.acaoNota}>Cadastrar barco, abrir datas e definir preços</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
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
    irPara: { flexDirection: 'row', gap: 8, marginTop: 14 },
    campoData: {
      flex: 1,
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 16,
      color: cores.texto,
    },
    irBotao: {
      paddingHorizontal: 22,
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: cores.acento,
    },
    irBotaoInativo: { backgroundColor: cores.borda },
    irTexto: { color: cores.acentoTexto, fontWeight: '700', fontSize: 16 },
    irTextoInativo: { color: cores.texto },
    dica: { color: cores.textoSuave, fontSize: 13, marginTop: 8, textAlign: 'center' },
    resumo: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginTop: 18,
      marginBottom: 20,
      gap: 6,
    },
    resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    resumoRotulo: { color: cores.textoSuave, fontSize: 14 },
    resumoValor: { color: cores.texto, fontSize: 15, fontWeight: '700' },
    divisoria: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },
    emAberto: { color: cores.erro },
    dia: { marginBottom: 18 },
    diaData: { fontSize: 15, fontWeight: '700', color: cores.texto, marginBottom: 8 },
    saida: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    saidaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    barco: { fontSize: 16, fontWeight: '700', color: cores.texto, flexShrink: 1 },
    selo: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    seloReservado: { backgroundColor: cores.acentoSuave, color: cores.acento },
    seloLivre: { backgroundColor: cores.superficieAlta, color: cores.textoSuave },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 5 },
    dinheiro: { fontSize: 13, color: cores.texto, marginTop: 5, fontWeight: '600' },
    obs: { fontSize: 12, color: cores.textoSuave, marginTop: 5, fontStyle: 'italic' },
    vazio: { color: cores.textoSuave, textAlign: 'center', lineHeight: 21 },
    acao: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: cores.acento,
      backgroundColor: cores.acentoSuave,
      borderRadius: 12,
      padding: 16,
    },
    acaoTexto: { fontSize: 16, fontWeight: '700', color: cores.acento },
    acaoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 2 },
    voltar: { marginTop: 24, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
