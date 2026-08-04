/**
 * Fechar a reserva: quantas pessoas, quem vai, e os dois aceites.
 *
 * O valor que aparece aqui é PRÉVIA. Quem soma de verdade é o servidor, na
 * função `criar_reserva`, lendo o preço da própria agenda. Se esta tela
 * mandasse o total, bastaria um `curl` com a chave publicável para reservar
 * um passeio de mil reais por um centavo.
 *
 * Os aceites são por pescaria, e não só no cadastro: é o aceite da reserva que
 * tem valor probatório quando alguém cancela meses depois e discorda da
 * retenção. Cada caixa nasce desmarcada — aceite pré-marcado é vício que
 * derruba a cláusula.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import { rotuloDaHora } from '@pescavertical/core/hora';
import { DOCUMENTOS_DA_RESERVA, buscarDocumentosVigentes, type DocumentoVigente } from '@/lib/legal';
import { mensagemDeErro } from '@/lib/erros';
import {
  barcoPublico,
  criarReserva,
  datasDisponiveis,
  paraBR,
  previaDoValor,
  type BarcoPublico,
  type DiaLivre,
} from '@/lib/reservas';
import { Botao, CaixaAceite, Campo, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

interface Acompanhante {
  nome: string;
  telefone: string;
}

export default function Reservar() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { barco: barcoId, data } = useLocalSearchParams<{ barco: string; data: string }>();

  const [barco, setBarco] = useState<BarcoPublico | null>(null);
  const [dia, setDia] = useState<DiaLivre | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoVigente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [qtd, setQtd] = useState(1);
  const [acompanhantes, setAcompanhantes] = useState<Acompanhante[]>([]);
  const [marcados, setMarcados] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    if (!barcoId || !data) return;
    setCarregando(true);
    setErro(null);
    try {
      const [b, dias, vigentes] = await Promise.all([
        barcoPublico(barcoId),
        datasDisponiveis(barcoId),
        buscarDocumentosVigentes(),
      ]);
      setBarco(b);
      setDia(dias.find((d) => d.data === data) ?? null);
      setDocumentos(vigentes.filter((v) => DOCUMENTOS_DA_RESERVA.includes(v.slug)));
      if (b) setQtd(b.capacidade_min);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível abrir esta data.'));
    } finally {
      setCarregando(false);
    }
  }, [barcoId, data]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mudarQtd(delta: number) {
    if (!barco) return;
    const novo = Math.min(barco.capacidade_max, Math.max(barco.capacidade_min, qtd + delta));
    setQtd(novo);
    // O titular ocupa um lugar; os acompanhantes ocupam o resto.
    setAcompanhantes((atual) => atual.slice(0, Math.max(0, novo - 1)));
  }

  function editarAcompanhante(i: number, campo: keyof Acompanhante, valor: string) {
    setAcompanhantes((atual) =>
      atual.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)),
    );
  }

  const aceitouTodos =
    documentos.length === DOCUMENTOS_DA_RESERVA.length &&
    documentos.every((d) => marcados.includes(d.slug));

  // Nome vazio derrubaria a reserva no servidor. Melhor dizer antes.
  const acompanhantesOk = acompanhantes.every((a) => a.nome.trim().length >= 2);

  const faltando: string[] = [];
  if (!aceitouTodos) faltando.push('aceitar a política de cancelamento e o termo de responsabilidade');
  if (!acompanhantesOk) faltando.push('preencher o nome de cada acompanhante');

  async function confirmar() {
    if (!barcoId || !data) return;
    setErro(null);
    setEnviando(true);
    try {
      await criarReserva({
        boatId: barcoId,
        data,
        qtdPescadores: qtd,
        participantes: acompanhantes.map((a) => ({
          nome: a.nome.trim(),
          telefone: a.telefone.trim() || null,
        })),
        aceitouPolitica: marcados.includes('politica_cancelamento'),
        aceitouTermo: marcados.includes('termo_responsabilidade'),
      });
      router.replace('/reservas');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível concluir a reserva.'));
      // A data pode ter sido fechada por outra pessoa enquanto esta tela
      // estava aberta. Recarregar mostra isso em vez de deixar tentar de novo.
      void carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Carregando…</Titulo>
      </ScrollView>
    );
  }

  if (!barco || !dia) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Data indisponível</Titulo>
        <Subtitulo>
          Esta data não está mais aberta — pode ter sido fechada por outra pessoa ou pelo
          próprio guia. Escolha outro dia.
        </Subtitulo>
        <Erro mensagem={erro} />
        <Pressable onPress={() => router.replace('/buscar')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar à busca</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titulo>{paraBR(dia.data)}</Titulo>
        <Subtitulo>
          {barco.nome} · {rotuloDaHora(dia.hora_saida)}
          {dia.observacao ? ` · ${dia.observacao}` : ''}
        </Subtitulo>

        <Text style={estilos.secao}>Quantos pescadores</Text>
        <View style={estilos.contador}>
          <Pressable
            onPress={() => mudarQtd(-1)}
            disabled={qtd <= barco.capacidade_min}
            accessibilityRole="button"
            accessibilityLabel="Menos um pescador"
            style={[estilos.passo, qtd <= barco.capacidade_min && estilos.passoInativo]}
          >
            <Text style={estilos.passoTexto}>−</Text>
          </Pressable>
          <Text style={estilos.qtd}>{qtd}</Text>
          <Pressable
            onPress={() => mudarQtd(1)}
            disabled={qtd >= barco.capacidade_max}
            accessibilityRole="button"
            accessibilityLabel="Mais um pescador"
            style={[estilos.passo, qtd >= barco.capacidade_max && estilos.passoInativo]}
          >
            <Text style={estilos.passoTexto}>+</Text>
          </Pressable>
        </View>
        <Text style={estilos.dica}>
          Este barco leva de {barco.capacidade_min} a {barco.capacidade_max} pescadores.
        </Text>

        <View style={estilos.previa}>
          <Text style={estilos.previaValor}>{formatarBRL(previaDoValor(dia, qtd))}</Text>
          <Text style={estilos.previaNota}>
            Valor estimado. A conta final é feita pelo servidor na confirmação, com o preço
            da agenda e o desconto a que você tiver direito.
          </Text>
        </View>

        {/* Com um pescador só não há acompanhante a informar — a seção inteira
            seria um convite a preencher nada. */}
        {qtd > 1 && (
          <>
            <Text style={estilos.secao}>Quem vai com você</Text>
            <Text style={estilos.dicaEsquerda}>
              Você é um dos {qtd}. Informe{' '}
              {qtd === 2 ? 'a outra pessoa' : `as outras ${qtd - 1} pessoas`} — o guia precisa
              dos nomes para o embarque. Ao cadastrar outra pessoa, você declara ter a
              autorização dela.
            </Text>
          </>
        )}

        {acompanhantes.map((a, i) => (
          <View key={i} style={estilos.acompanhante}>
            <Campo
              rotulo={`Acompanhante ${i + 1}`}
              value={a.nome}
              onChangeText={(t) => editarAcompanhante(i, 'nome', t)}
              placeholder="Nome completo"
              autoCapitalize="words"
            />
            <Campo
              rotulo="Telefone (opcional)"
              value={a.telefone}
              onChangeText={(t) => editarAcompanhante(i, 'telefone', t)}
              placeholder="(35) 99999-0000"
              keyboardType="phone-pad"
            />
            <Pressable onPress={() => setAcompanhantes((x) => x.filter((_, j) => j !== i))}>
              <Text style={estilos.remover}>Remover</Text>
            </Pressable>
          </View>
        ))}

        {acompanhantes.length < qtd - 1 && (
          <Pressable
            onPress={() => setAcompanhantes((x) => [...x, { nome: '', telefone: '' }])}
            accessibilityRole="button"
            style={estilos.adicionar}
          >
            <Text style={estilos.adicionarTexto}>+ Adicionar acompanhante</Text>
          </Pressable>
        )}

        <Text style={estilos.secao}>Antes de confirmar</Text>
        {documentos.length < DOCUMENTOS_DA_RESERVA.length ? (
          <Text style={estilos.dicaEsquerda}>
            Não consegui carregar os documentos desta reserva. Tente de novo daqui a pouco —
            sem eles a reserva não pode ser fechada.
          </Text>
        ) : (
          documentos.map((d) => (
            <CaixaAceite
              key={d.slug}
              marcada={marcados.includes(d.slug)}
              onToggle={() =>
                setMarcados((m) =>
                  m.includes(d.slug) ? m.filter((s) => s !== d.slug) : [...m, d.slug],
                )
              }
            >
              <Text style={estilos.aceiteTexto}>
                Li e aceito{' '}
                <Text
                  style={estilos.aceiteLink}
                  onPress={() =>
                    router.push({
                      pathname: '/documento',
                      params: { slug: d.slug, versao: d.versao },
                    })
                  }
                >
                  {d.titulo}
                </Text>{' '}
                <Text style={estilos.versao}>(versão {d.versao})</Text>
              </Text>
            </CaixaAceite>
          ))
        )}

        <Botao
          titulo="Confirmar reserva"
          onPress={confirmar}
          carregando={enviando}
          desabilitado={faltando.length > 0}
        />

        {faltando.length > 0 && (
          <Text style={estilos.dica}>Falta {faltando.join(' e ')}.</Text>
        )}

        <Erro mensagem={erro} />

        <Text style={estilos.rodape}>
          A reserva segura a data por tempo limitado até o pagamento do sinal. Passado o
          prazo sem pagar, o dia volta para a agenda.
        </Text>

        <Pressable onPress={() => router.back()} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    secao: { fontSize: 15, fontWeight: '700', color: cores.texto, marginTop: 24, marginBottom: 10 },
    contador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
    passo: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: cores.acento,
      backgroundColor: cores.acentoSuave,
      alignItems: 'center',
      justifyContent: 'center',
    },
    passoInativo: { borderColor: cores.borda, backgroundColor: cores.superficieAlta },
    passoTexto: { fontSize: 24, fontWeight: '700', color: cores.acento, lineHeight: 28 },
    qtd: { fontSize: 32, fontWeight: '700', color: cores.texto, minWidth: 48, textAlign: 'center' },
    dica: { color: cores.textoSuave, fontSize: 13, marginTop: 10, textAlign: 'center' },
    dicaEsquerda: { color: cores.textoSuave, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    previa: {
      backgroundColor: cores.acentoSuave,
      borderRadius: 12,
      padding: 16,
      marginTop: 20,
      alignItems: 'center',
    },
    previaValor: { fontSize: 26, fontWeight: '700', color: cores.acento },
    previaNota: { fontSize: 12, color: cores.textoSuave, textAlign: 'center', marginTop: 6, lineHeight: 17 },
    acompanhante: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    remover: { color: cores.erro, fontWeight: '600', textAlign: 'right' },
    adicionar: { paddingVertical: 12, alignItems: 'center' },
    adicionarTexto: { color: cores.acento, fontWeight: '700' },
    aceiteTexto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
    aceiteLink: { color: cores.acento, fontWeight: '700', textDecorationLine: 'underline' },
    versao: { color: cores.textoSuave, fontSize: 12 },
    rodape: { fontSize: 12, color: cores.textoSuave, marginTop: 20, lineHeight: 18, textAlign: 'center' },
    voltar: { marginTop: 24, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
