/**
 * Barcos de um guia e as datas livres de cada um.
 *
 * As datas vêm da função `datas_disponiveis`, não da tabela da agenda. A tabela
 * mostra o dia aberto; ela não sabe dizer se alguém já fechou aquele dia,
 * porque o cliente não enxerga a reserva de outra pessoa. Sem a função, o
 * aplicativo ofereceria datas vendidas e a pessoa só descobriria no erro,
 * depois de escolher os acompanhantes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import { rotuloDaHora } from '@pescavertical/core/hora';
import { mensagemDeErro } from '@/lib/erros';
import {
  barcosDoGuiaPublico,
  datasDisponiveis,
  guiasAbertos,
  paraBR,
  type BarcoPublico,
  type DiaLivre,
  type GuiaPublico,
} from '@/lib/reservas';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Operacao() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { guia } = useLocalSearchParams<{ guia: string }>();

  const [dados, setDados] = useState<GuiaPublico | null>(null);
  const [barcos, setBarcos] = useState<BarcoPublico[]>([]);
  const [agendas, setAgendas] = useState<Record<string, DiaLivre[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!guia) return;
    setCarregando(true);
    setErro(null);
    try {
      const [todos, frota] = await Promise.all([guiasAbertos(), barcosDoGuiaPublico(guia)]);
      setDados(todos.find((g) => g.id === guia) ?? null);
      setBarcos(frota);

      // Uma chamada por barco. Com frotas pequenas isso é mais simples — e mais
      // honesto — que inventar um endpoint agregador antes de precisar dele.
      const pares = await Promise.all(
        frota.map(async (b) => [b.id, await datasDisponiveis(b.id)] as const),
      );
      setAgendas(Object.fromEntries(pares));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar esta operação.'));
    } finally {
      setCarregando(false);
    }
  }, [guia]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      {carregando ? (
        <>
          <Titulo>Carregando…</Titulo>
        </>
      ) : !dados ? (
        <>
          <Titulo>Operação não encontrada</Titulo>
          <Subtitulo>
            Ela pode ter sido suspensa. Volte à busca para ver quem está atendendo.
          </Subtitulo>
        </>
      ) : (
        <>
          <Titulo>{dados.nome_operacao}</Titulo>
          <Subtitulo>
            {[dados.cidade, dados.bio].filter(Boolean).join(' · ') ||
              'Escolha o barco e o dia da pescaria.'}
          </Subtitulo>

          <Erro mensagem={erro} />

          {barcos.length === 0 && (
            <Text style={estilos.vazio}>Este guia ainda não cadastrou barcos.</Text>
          )}

          {barcos.map((b) => {
            const dias = agendas[b.id] ?? [];
            return (
              <View key={b.id} style={estilos.cartao}>
                <Text style={estilos.nome}>{b.nome}</Text>
                <Text style={estilos.detalhe}>
                  {[b.modelo, `${b.capacidade_min} a ${b.capacidade_max} pescadores`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {b.equipamentos ? <Text style={estilos.detalhe}>{b.equipamentos}</Text> : null}

                <Text style={estilos.secao}>Datas livres</Text>
                {dias.length === 0 ? (
                  <Text style={estilos.semData}>
                    Nenhuma data aberta no momento.
                  </Text>
                ) : (
                  dias.map((d) => (
                    <Pressable
                      key={d.data}
                      accessibilityRole="button"
                      style={estilos.dia}
                      onPress={() =>
                        router.push({
                          pathname: '/reservar',
                          params: { barco: b.id, data: d.data },
                        })
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.diaData}>{paraBR(d.data)}</Text>
                        <Text style={estilos.diaPreco}>
                          {d.preco_barco_centavos > 0 &&
                            `${formatarBRL(d.preco_barco_centavos)} o dia`}
                          {d.preco_barco_centavos > 0 && d.preco_passageiro_centavos > 0 && ' + '}
                          {d.preco_passageiro_centavos > 0 &&
                            `${formatarBRL(d.preco_passageiro_centavos)} por pescador`}
                        </Text>
                        <Text style={estilos.diaObs}>
                          {rotuloDaHora(d.hora_saida)}
                          {d.observacao ? ` · ${d.observacao}` : ''}
                        </Text>
                      </View>
                      <Text style={estilos.escolher}>Reservar</Text>
                    </Pressable>
                  ))
                )}
              </View>
            );
          })}
        </>
      )}

      <Pressable onPress={() => router.replace('/buscar')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar à busca</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    nome: { fontSize: 17, fontWeight: '700', color: cores.texto },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 4 },
    secao: { fontSize: 13, fontWeight: '700', color: cores.texto, marginTop: 16, marginBottom: 8 },
    semData: { fontSize: 14, color: cores.textoSuave },
    dia: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    diaData: { fontSize: 16, fontWeight: '700', color: cores.texto },
    diaPreco: { fontSize: 13, color: cores.textoSuave, marginTop: 2 },
    diaObs: { fontSize: 12, color: cores.textoSuave, marginTop: 4, fontStyle: 'italic' },
    escolher: { color: cores.acento, fontWeight: '700' },
    vazio: { color: cores.textoSuave, textAlign: 'center', lineHeight: 21 },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
