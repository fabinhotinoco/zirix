/**
 * Tela do master: a fila de guias e as duas decisões que só ele toma —
 * aprovar/suspender e definir a comissão.
 *
 * A comissão tem três estados, não dois: um número, ou "usa o padrão da
 * plataforma". Campo vazio grava nulo, que é diferente de zero — zero seria um
 * guia isento, e isso precisa ser uma escolha explícita, nunca um descuido.
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { mensagemDeErro } from '@/lib/erros';
import {
  comissaoPadrao,
  decidirSobreGuia,
  todosOsGuias,
  type Guia,
  type StatusGuia,
} from '@/lib/guias';
import { Botao, Campo, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Guias() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao, perfil } = useAuth();

  const [guias, setGuias] = useState<Guia[]>([]);
  const [padrao, setPadrao] = useState<number | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [comissao, setComissao] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, p] = await Promise.all([todosOsGuias(), comissaoPadrao()]);
      setGuias(lista);
      setPadrao(p);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os guias.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(g: Guia) {
    setAberto(aberto === g.id ? null : g.id);
    setComissao(g.comissao_percentual != null ? String(g.comissao_percentual) : '');
    setErro(null);
  }

  async function decidir(g: Guia, status: StatusGuia) {
    if (!sessao) return;
    setErro(null);

    // Vazio = herda o padrão. Só vira número quando alguém digita um número.
    const texto = comissao.trim().replace(',', '.');
    let valor: number | null = null;
    if (texto !== '') {
      valor = Number(texto);
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        setErro('A comissão precisa ser um número entre 0 e 100, ou vazio para usar o padrão.');
        return;
      }
    }

    setSalvando(g.id);
    try {
      await decidirSobreGuia(g.id, status, valor, sessao.user.id);
      await carregar();
      setAberto(null);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar a decisão.'));
    } finally {
      setSalvando(null);
    }
  }

  if (perfil && perfil.role !== 'master') {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Sem acesso</Titulo>
        <Subtitulo>Esta tela é da administração da plataforma.</Subtitulo>
        <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const pendentes = guias.filter((g) => g.status === 'pendente').length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titulo>Guias</Titulo>
        <Subtitulo>
          {carregando
            ? 'Carregando…'
            : pendentes > 0
              ? `${pendentes} aguardando sua decisão.`
              : 'Nenhuma inscrição aguardando.'}
        </Subtitulo>

        <Erro mensagem={erro} />

        {guias.map((g) => (
          <View key={g.id} style={estilos.cartao}>
            <Pressable onPress={() => abrir(g)}>
              <View style={estilos.linha}>
                <Text style={estilos.nome}>{g.nome_operacao}</Text>
                <Text style={[estilos.selo, estilos[g.status]]}>
                  {g.status === 'pendente'
                    ? 'pendente'
                    : g.status === 'aprovado'
                      ? 'aprovado'
                      : 'suspenso'}
                </Text>
              </View>
              <Text style={estilos.detalhe}>
                {[g.cidade, g.documento].filter(Boolean).join(' · ') || 'sem dados de operação'}
              </Text>
              <Text style={estilos.detalhe}>
                Comissão:{' '}
                {g.comissao_percentual != null
                  ? `${g.comissao_percentual}%`
                  : `padrão${padrao != null ? ` (${padrao}%)` : ''}`}
                {g.mp_conectado_em ? ' · Mercado Pago conectado' : ' · Mercado Pago não conectado'}
              </Text>
            </Pressable>

            {aberto === g.id && (
              <View style={estilos.decisao}>
                <Campo
                  rotulo="Comissão desta operação (%)"
                  value={comissao}
                  onChangeText={setComissao}
                  placeholder={padrao != null ? `vazio = padrão (${padrao}%)` : 'vazio = padrão'}
                  keyboardType="decimal-pad"
                />
                <Text style={estilos.nota}>
                  Deixe vazio para o guia seguir o padrão da plataforma. Zero significa
                  isentar este guia de comissão.
                </Text>

                {g.status !== 'aprovado' && (
                  <Botao
                    titulo="Aprovar"
                    onPress={() => decidir(g, 'aprovado')}
                    carregando={salvando === g.id}
                  />
                )}
                {g.status === 'aprovado' && (
                  <>
                    <Botao
                      titulo="Salvar comissão"
                      onPress={() => decidir(g, 'aprovado')}
                      carregando={salvando === g.id}
                    />
                    <Pressable onPress={() => decidir(g, 'suspenso')} style={estilos.suspender}>
                      <Text style={estilos.suspenderTexto}>Suspender operação</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
        ))}

        {!carregando && guias.length === 0 && (
          <Text style={estilos.vazio}>Nenhum guia cadastrado ainda.</Text>
        )}

        <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    nome: { fontSize: 16, fontWeight: '700', color: cores.texto, flexShrink: 1 },
    selo: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    pendente: { backgroundColor: cores.superficieAlta, color: cores.aviso },
    aprovado: { backgroundColor: cores.acentoSuave, color: cores.acento },
    suspenso: { backgroundColor: cores.superficieAlta, color: cores.erro },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 4 },
    decisao: { marginTop: 14, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 14 },
    nota: { fontSize: 12, color: cores.textoSuave, marginTop: -8, marginBottom: 12, lineHeight: 17 },
    suspender: { marginTop: 14, alignItems: 'center' },
    suspenderTexto: { color: cores.erro, fontWeight: '600' },
    vazio: { color: cores.textoSuave, textAlign: 'center', marginTop: 20 },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
