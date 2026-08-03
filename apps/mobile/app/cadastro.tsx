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
import { mensagemDeErro } from '@/lib/erros';
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
  const { sessao, recarregarPerfil, sair } = useAuth();

  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<Extract<Papel, 'cliente' | 'guia'>>('cliente');
  const [nomeOperacao, setNomeOperacao] = useState('');

  const [pendentes, setPendentes] = useState<DocumentoVigente[]>([]);
  const [marcados, setMarcados] = useState<DocumentoSlug[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregou, setCarregou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Depender de `sessao` inteiro era um erro sutil: o Supabase entrega um objeto
  // novo a cada renovação de token, e isso refazia a busca e limpava as caixas
  // que a pessoa já tinha marcado — do lado de cá parece que clicar não faz
  // nada. O identificador é o que realmente importa aqui, e ele não muda.
  const userId = sessao?.user.id ?? null;

  const carregarPendencias = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    setErro(null);
    try {
      const docs = await pendenciasDoCadastro(userId, papel);
      setPendentes(docs);
      setCarregou(true);
    } catch (e) {
      setCarregou(false);
      setErro(mensagemDeErro(e, 'Não foi possível carregar os documentos.'));
    } finally {
      setCarregando(false);
    }
  }, [userId, papel]);

  useEffect(() => {
    void carregarPendencias();
  }, [carregarPendencias]);

  // Trocar de papel muda quais documentos valem, então as marcações anteriores
  // não se aplicam mais. Só aqui — nunca por causa de uma recarga qualquer.
  useEffect(() => {
    setMarcados([]);
  }, [papel]);

  function alternar(slug: DocumentoSlug) {
    setMarcados((atual) =>
      atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug],
    );
  }

  const tudoMarcado = pendentes.every((d) => marcados.includes(d.slug));
  const nomeValido = nome.trim().length >= 3;
  const operacaoValida = papel !== 'guia' || nomeOperacao.trim().length >= 3;
  // `every` numa lista vazia devolve true. Sem exigir `carregou`, uma falha ao
  // buscar os documentos habilitaria o botão e o cadastro seria concluído sem
  // aceite nenhum — silenciosamente, que é o pior jeito de esse defeito
  // aparecer.
  const podeConcluir =
    nomeValido && operacaoValida && tudoMarcado && carregou && !carregando;

  // Botão desabilitado sem explicação é um beco sem saída: a pessoa clica, nada
  // acontece, e não há como descobrir o que falta. A dica antiga só falava dos
  // aceites — quem marcasse as duas caixas e deixasse o nome em branco ficava
  // sem mensagem nenhuma.
  const faltando: string[] = [];
  if (!nomeValido) faltando.push('escrever seu nome completo');
  if (!operacaoValida) faltando.push('informar o nome da sua operação');
  if (!tudoMarcado) faltando.push('aceitar todos os documentos');
  if (!carregou && !carregando) faltando.push('carregar os documentos — toque para tentar de novo');

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
      setErro(mensagemDeErro(e, 'Não foi possível concluir o cadastro.'));
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

        {!carregando && faltando.length > 0 && (
          <Pressable onPress={() => void carregarPendencias()}>
            <Text style={estilos.dica}>Falta {faltando.join(', ')}.</Text>
          </Pressable>
        )}

        <Erro mensagem={erro} />

        {/* Saída de emergência: sem isto, quem chega aqui com a conta errada
            fica preso — esta tela não tem para onde voltar. */}
        <Pressable onPress={sair} style={estilos.sair}>
          <Text style={estilos.sairTexto}>Entrar com outra conta</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
  sair: { marginTop: 28, alignItems: 'center' },
  sairTexto: { color: cores.agua, fontWeight: '600' },
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
