/**
 * Cadastro: nome, papel e os aceites obrigatórios.
 *
 * Três regras que decidem se o aceite vale como prova, e que estão
 * implementadas aqui de propósito:
 *   1. Nenhuma caixa nasce marcada.
 *   2. Uma caixa por documento, cada uma com link para ler o texto inteiro.
 *   3. O botão só habilita quando todas estiverem marcadas.
 */

import { useCallback, useEffect, useState } from 'react';
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

import { useAuth, type Papel } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  pendenciasDoCadastro,
  registrarAceites,
  type DocumentoSlug,
  type DocumentoVigente,
} from '@/lib/legal';
import {
  Botao,
  CaixaAceite,
  Campo,
  Erro,
  Subtitulo,
  Titulo,
  cores,
} from '@/ui/componentes';

export default function Cadastro() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao, recarregarPerfil } = useAuth();

  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<Extract<Papel, 'cliente' | 'guia'>>('cliente');
  const [nomeOperacao, setNomeOperacao] = useState('');

  const [pendentes, setPendentes] = useState<DocumentoVigente[]>([]);
  const [marcados, setMarcados] = useState<DocumentoSlug[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarPendencias = useCallback(async () => {
    if (!sessao) return;
    setCarregando(true);
    setErro(null);
    try {
      const docs = await pendenciasDoCadastro(sessao.user.id, papel);
      setPendentes(docs);
      // Trocar de papel muda os documentos: as marcações anteriores caem.
      setMarcados([]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os documentos.');
    } finally {
      setCarregando(false);
    }
  }, [sessao, papel]);

  useEffect(() => {
    void carregarPendencias();
  }, [carregarPendencias]);

  function alternar(slug: DocumentoSlug) {
    setMarcados((atual) =>
      atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug],
    );
  }

  const tudoMarcado = pendentes.every((d) => marcados.includes(d.slug));
  const nomeValido = nome.trim().length >= 3;
  const operacaoValida = papel !== 'guia' || nomeOperacao.trim().length >= 3;
  const podeConcluir = nomeValido && operacaoValida && tudoMarcado && !carregando;

  async function concluir() {
    if (!sessao) return;
    setErro(null);
    setSalvando(true);
    try {
      const { error: erroPerfil } = await supabase.from('profiles').insert({
        id: sessao.user.id,
        nome: nome.trim(),
        email: sessao.user.email ?? null,
        telefone: sessao.user.phone ?? null,
        role: papel,
      });
      if (erroPerfil) throw new Error(erroPerfil.message);

      await registrarAceites(sessao.user.id, pendentes, marcados);

      if (papel === 'guia') {
        const { error: erroGuia } = await supabase.from('guides').insert({
          user_id: sessao.user.id,
          nome_operacao: nomeOperacao.trim(),
        });
        if (erroGuia) throw new Error(erroGuia.message);
      }

      await recarregarPerfil();
      router.replace('/inicio');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setSalvando(false);
    }
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
        <Titulo>Seus dados</Titulo>
        <Subtitulo>Falta pouco para você começar a pescar com a gente.</Subtitulo>

        <Campo
          rotulo="Nome completo"
          value={nome}
          onChangeText={setNome}
          placeholder="Como podemos te chamar"
          autoCapitalize="words"
        />

        <Text style={estilos.rotulo}>Você é</Text>
        <View style={estilos.abas}>
          {([
            ['cliente', 'Pescador'],
            ['guia', 'Guia de pesca'],
          ] as const).map(([valor, texto]) => (
            <Pressable
              key={valor}
              onPress={() => setPapel(valor)}
              style={[estilos.aba, papel === valor && estilos.abaAtiva]}
            >
              <Text style={[estilos.abaTexto, papel === valor && estilos.abaTextoAtivo]}>
                {texto}
              </Text>
            </Pressable>
          ))}
        </View>

        {papel === 'guia' && (
          <>
            <Campo
              rotulo="Nome da sua operação"
              value={nomeOperacao}
              onChangeText={setNomeOperacao}
              placeholder="Ex.: Pesca Vertical"
              autoCapitalize="words"
            />
            <Text style={estilos.aviso}>
              Seu cadastro fica pendente até a plataforma aprovar. Depois disso você conecta
              sua conta do Mercado Pago e publica sua agenda.
            </Text>
          </>
        )}

        <View style={estilos.divisor} />

        <Text style={estilos.secao}>Para continuar, leia e aceite</Text>

        {carregando ? (
          <Text style={estilos.carregando}>Carregando documentos…</Text>
        ) : (
          pendentes.map((doc) => (
            <CaixaAceite
              key={doc.slug}
              marcada={marcados.includes(doc.slug)}
              onToggle={() => alternar(doc.slug)}
            >
              <Text style={estilos.aceiteTexto}>
                Li e concordo com{' '}
                <Text
                  style={estilos.link}
                  onPress={() =>
                    router.push({
                      pathname: '/documento',
                      params: { slug: doc.slug, versao: doc.versao },
                    })
                  }
                >
                  {doc.titulo}
                </Text>
              </Text>
              <Text style={estilos.versao}>versão {doc.versao}</Text>
            </CaixaAceite>
          ))
        )}

        <Botao
          titulo="Concluir cadastro"
          onPress={concluir}
          carregando={salvando}
          desabilitado={!podeConcluir}
        />

        {!carregando && !tudoMarcado && pendentes.length > 0 && (
          <Text style={estilos.dica}>
            É preciso aceitar todos os documentos para continuar.
          </Text>
        )}

        <Erro mensagem={erro} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  abas: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  aba: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cores.borda,
    alignItems: 'center',
  },
  abaAtiva: { backgroundColor: cores.aguaClara, borderColor: cores.agua },
  abaTexto: { color: cores.suave, fontWeight: '600' },
  abaTextoAtivo: { color: cores.agua },
  aviso: { fontSize: 13, color: cores.suave, lineHeight: 19, marginBottom: 8 },
  divisor: { height: 1, backgroundColor: cores.borda, marginVertical: 24 },
  secao: { fontSize: 15, fontWeight: '700', color: cores.texto, marginBottom: 14 },
  carregando: { color: cores.suave, marginBottom: 16 },
  aceiteTexto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
  link: { color: cores.agua, fontWeight: '600', textDecorationLine: 'underline' },
  versao: { fontSize: 12, color: cores.suave, marginTop: 2 },
  dica: { fontSize: 13, color: cores.suave, marginTop: 10, textAlign: 'center' },
});
