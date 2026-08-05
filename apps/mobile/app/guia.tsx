/**
 * Painel do guia: situação da inscrição e os dados que ele mesmo edita.
 *
 * O que NÃO está aqui é tão importante quanto o que está: status e comissão
 * aparecem só para leitura. Não é escolha de tela — o banco recusa a alteração
 * (0003_guia_nao_se_aprova.sql). A tela reflete a regra em vez de fingir uma
 * permissão que não existe.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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
import {
  conectarMercadoPago,
  desconectarMercadoPago,
  faltaConfiguracao,
} from '@/lib/mercadopago';
import { Botao, Campo, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

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
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
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
  const [conectando, setConectando] = useState(false);
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

  // O guia autoriza no navegador e volta para cá. Quem sabe se deu certo é o
  // banco — o navegador pode ter sido fechado à força, trocado de aba ou
  // mandado para segundo plano. Por isso a tela pergunta de novo ao reaparecer,
  // em vez de esperar uma resposta que pode nunca chegar.
  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function conectar() {
    setErro(null);
    setConectando(true);
    try {
      await conectarMercadoPago();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível abrir a autorização do Mercado Pago.'));
    } finally {
      setConectando(false);
    }
  }

  async function desconectar() {
    setErro(null);
    setConectando(true);
    try {
      await desconectarMercadoPago();
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível desconectar.'));
    } finally {
      setConectando(false);
    }
  }

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

            {/* A conta de recebimento vem antes de tudo: sem ela o guia não
                publica data nenhuma (0005_porta_de_entrada_da_agenda.sql).
                Fica no topo porque é o que está travando o resto. */}
            <View
              style={[
                estilos.cartao,
                guia.mp_conectado_em ? estilos.cartaoOk : estilos.cartaoPendente,
              ]}
            >
              <Text style={estilos.rotulo}>Conta de recebimento</Text>

              {guia.mp_conectado_em ? (
                <>
                  <Text style={estilos.valor}>Mercado Pago conectado</Text>
                  <Text style={estilos.nota}>
                    O valor de cada pescaria cai direto na sua conta, já com a comissão da
                    plataforma descontada. A tarifa de processamento do Mercado Pago varia
                    conforme o meio de pagamento que o cliente escolher e também é
                    descontada do seu valor.
                  </Text>
                  <Pressable onPress={desconectar} disabled={conectando}>
                    <Text style={estilos.desconectar}>
                      {conectando ? 'Desconectando…' : 'Desconectar esta conta'}
                    </Text>
                  </Pressable>
                </>
              ) : guia.status !== 'aprovado' ? (
                <>
                  <Text style={estilos.valor}>Ainda não conectada</Text>
                  <Text style={estilos.nota}>
                    A conexão vem depois da aprovação da sua operação. Assim que ela for
                    aprovada, o botão aparece aqui.
                  </Text>
                </>
              ) : faltaConfiguracao() ? (
                <>
                  <Text style={estilos.valor}>Ainda não conectada</Text>
                  <Text style={estilos.nota}>{faltaConfiguracao()}</Text>
                </>
              ) : (
                <>
                  <Text style={estilos.valor}>Ainda não conectada</Text>
                  <Text style={estilos.nota}>
                    Enquanto você não conectar, não é possível abrir datas na agenda — uma
                    reserva sem conta conectada não teria como ser paga. Você vai para uma
                    página do Mercado Pago, entra na sua conta e autoriza. A plataforma
                    nunca vê sua senha.
                  </Text>
                  <Botao
                    titulo="Conectar Mercado Pago"
                    onPress={conectar}
                    carregando={conectando}
                  />
                  <Text style={estilos.nota}>
                    Já autorizou e ainda aparece como não conectada? Volte a esta tela que
                    ela confere de novo.
                  </Text>
                </>
              )}
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

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    faixa: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
    pendente: { backgroundColor: cores.superficieAlta, borderColor: cores.aviso },
    aprovado: { backgroundColor: cores.acentoSuave, borderColor: cores.acento },
    suspenso: { backgroundColor: cores.superficieAlta, borderColor: cores.erro },
    faixaTitulo: { fontWeight: '700', color: cores.texto, marginBottom: 4 },
    faixaTexto: { color: cores.texto, lineHeight: 20 },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    cartaoOk: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
    cartaoPendente: { borderColor: cores.aviso },
    rotulo: { fontSize: 12, color: cores.textoSuave },
    valor: { fontSize: 16, color: cores.texto, fontWeight: '600', marginTop: 2 },
    nota: { fontSize: 12, color: cores.textoSuave, marginTop: 8, lineHeight: 17 },
    desconectar: { color: cores.textoSuave, fontWeight: '600', marginTop: 14 },
    ok: { color: cores.acento, fontWeight: '600', marginTop: 12, textAlign: 'center' },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
