/**
 * Painel do guia: situação da inscrição e os dados que ele mesmo edita.
 *
 * O que NÃO está aqui é tão importante quanto o que está: status e comissão
 * aparecem só para leitura. Não é escolha de tela — o banco recusa a alteração
 * (0003_guia_nao_se_aprova.sql). A tela reflete a regra em vez de fingir uma
 * permissão que não existe.
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

import { useAuth } from '@/lib/auth';
import { mensagemDeErro } from '@/lib/erros';
import { comissaoPadrao, meuGuia, salvarDadosDoGuia, type Guia } from '@/lib/guias';
import { Botao, Campo, Erro, Subtitulo, Titulo, cores } from '@/ui/componentes';

const EXPLICACAO: Record<Guia['status'], string> = {
  pendente:
    'Sua inscrição está na fila de aprovação. Enquanto isso você pode completar ' +
    'os dados da operação — quanto mais completos, mais rápida a análise.',
  aprovado:
    'Operação aprovada. O próximo passo é conectar sua conta do Mercado Pago e ' +
    'cadastrar seus barcos.',
  suspenso:
    'Sua operação está suspensa e não aparece para os pescadores. Fale com a ' +
    'administração da plataforma.',
};

export default function PainelGuia() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao } = useAuth();

  const [guia, setGuia] = useState<Guia | null>(null);
  const [padrao, setPadrao] = useState<number | null>(null);
  const [nomeOperacao, setNomeOperacao] = useState('');
  const [documento, setDocumento] = useState('');
  const [cidade, setCidade] = useState('');
  const [bio, setBio] = useState('');

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const userId = sessao?.user.id ?? null;

  const carregar = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    setErro(null);
    try {
      const [g, p] = await Promise.all([meuGuia(userId), comissaoPadrao()]);
      setGuia(g);
      setPadrao(p);
      if (g) {
        setNomeOperacao(g.nome_operacao);
        setDocumento(g.documento ?? '');
        setCidade(g.cidade ?? '');
        setBio(g.bio ?? '');
      }
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar sua operação.'));
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    if (!guia) return;
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    try {
      await salvarDadosDoGuia(guia.id, {
        nome_operacao: nomeOperacao.trim(),
        documento: documento.trim() || null,
        cidade: cidade.trim() || null,
        bio: bio.trim() || null,
      });
      setSalvo(true);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  const comissaoTexto =
    guia?.comissao_percentual != null
      ? `${guia.comissao_percentual}% (acordo específico com você)`
      : padrao != null
        ? `${padrao}% (padrão da plataforma)`
        : 'padrão da plataforma';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titulo>Minha operação</Titulo>

        {carregando ? (
          <Subtitulo>Carregando…</Subtitulo>
        ) : !guia ? (
          <>
            <Subtitulo>Não encontrei uma operação ligada à sua conta.</Subtitulo>
            <Erro mensagem={erro} />
          </>
        ) : (
          <>
            <View style={[estilos.faixa, estilos[guia.status]]}>
              <Text style={estilos.faixaTitulo}>
                {guia.status === 'pendente'
                  ? 'Aguardando aprovação'
                  : guia.status === 'aprovado'
                    ? 'Aprovada'
                    : 'Suspensa'}
              </Text>
              <Text style={estilos.faixaTexto}>{EXPLICACAO[guia.status]}</Text>
            </View>

            <View style={estilos.cartao}>
              <Text style={estilos.rotulo}>Comissão da plataforma</Text>
              <Text style={estilos.valor}>{comissaoTexto}</Text>
              <Text style={estilos.nota}>
                Definida pela administração. Incide sobre o valor de cada passeio e é
                descontada automaticamente no pagamento.
              </Text>
            </View>

            <Campo
              rotulo="Nome da operação"
              value={nomeOperacao}
              onChangeText={setNomeOperacao}
              placeholder="Ex.: Pesca Vertical"
              autoCapitalize="words"
            />
            <Campo
              rotulo="CNPJ ou CPF"
              value={documento}
              onChangeText={setDocumento}
              placeholder="Só números"
              keyboardType="number-pad"
            />
            <Campo
              rotulo="Cidade"
              value={cidade}
              onChangeText={setCidade}
              placeholder="Onde você opera"
              autoCapitalize="words"
            />
            <Campo
              rotulo="Sobre a operação"
              value={bio}
              onChangeText={setBio}
              placeholder="Barcos, região, experiência…"
              multiline
              numberOfLines={4}
            />

            <Botao
              titulo="Salvar"
              onPress={salvar}
              carregando={salvando}
              desabilitado={nomeOperacao.trim().length < 3}
            />

            {salvo && <Text style={estilos.ok}>Dados salvos.</Text>}
            <Erro mensagem={erro} />
          </>
        )}

        <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
  faixa: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  pendente: { backgroundColor: '#FFF7E6', borderColor: '#E6C77A' },
  aprovado: { backgroundColor: cores.aguaClara, borderColor: cores.agua },
  suspenso: { backgroundColor: '#FDECEA', borderColor: cores.erro },
  faixaTitulo: { fontWeight: '700', color: cores.texto, marginBottom: 4 },
  faixaTexto: { color: cores.texto, lineHeight: 20 },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  rotulo: { fontSize: 12, color: cores.suave },
  valor: { fontSize: 16, color: cores.texto, fontWeight: '600', marginTop: 2 },
  nota: { fontSize: 12, color: cores.suave, marginTop: 8, lineHeight: 17 },
  ok: { color: cores.agua, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  voltar: { marginTop: 28, alignItems: 'center' },
  voltarTexto: { color: cores.agua, fontWeight: '600' },
});
