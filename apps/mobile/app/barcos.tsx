/**
 * Frota do guia: cadastrar barcos e entrar na agenda de cada um.
 *
 * As fotos ficam para depois — dependem do armazenamento de arquivos, que entra
 * junto com o feed de capturas. Um barco sem foto já é reservável; um barco que
 * não existe, não.
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
import { barcosDoGuia, criarBarco, salvarBarco, type Barco } from '@/lib/barcos';
import { mensagemDeErro } from '@/lib/erros';
import { meuGuia, type Guia } from '@/lib/guias';
import { Botao, Campo, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Barcos() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao } = useAuth();

  const [guia, setGuia] = useState<Guia | null>(null);
  const [barcos, setBarcos] = useState<Barco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [modelo, setModelo] = useState('');
  const [minimo, setMinimo] = useState('1');
  const [maximo, setMaximo] = useState('');
  const [equipamentos, setEquipamentos] = useState('');
  const [salvando, setSalvando] = useState(false);

  const userId = sessao?.user.id ?? null;

  const carregar = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    setErro(null);
    try {
      const g = await meuGuia(userId);
      setGuia(g);
      setBarcos(g ? await barcosDoGuia(g.id) : []);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar seus barcos.'));
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const min = Number(minimo);
  const max = Number(maximo);
  const capacidadeValida =
    Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min;

  async function adicionar() {
    if (!guia) return;
    setErro(null);
    setSalvando(true);
    try {
      await criarBarco(guia.id, {
        nome: nome.trim(),
        modelo: modelo.trim() || null,
        capacidade_min: min,
        capacidade_max: max,
        equipamentos: equipamentos.trim() || null,
      });
      setNome('');
      setModelo('');
      setMinimo('1');
      setMaximo('');
      setEquipamentos('');
      setNovo(false);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível cadastrar o barco.'));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(b: Barco) {
    setErro(null);
    try {
      await salvarBarco(b.id, { status: b.status === 'ativo' ? 'inativo' : 'ativo' });
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível alterar o barco.'));
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
        <Titulo>Meus barcos</Titulo>

        {carregando ? (
          <Subtitulo>Carregando…</Subtitulo>
        ) : !guia ? (
          <Subtitulo>Não encontrei uma operação ligada à sua conta.</Subtitulo>
        ) : (
          <>
            {guia.status !== 'aprovado' && (
              <View style={estilos.aviso}>
                <Text style={estilos.avisoTexto}>
                  Sua operação ainda não foi aprovada. Você já pode cadastrar os barcos —
                  só não conseguirá abrir datas na agenda até a aprovação sair.
                </Text>
              </View>
            )}

            <Subtitulo>
              {barcos.length === 0
                ? 'Nenhum barco cadastrado ainda.'
                : `${barcos.length} ${barcos.length === 1 ? 'barco' : 'barcos'} na sua frota.`}
            </Subtitulo>

            <Erro mensagem={erro} />

            {barcos.map((b) => (
              <View key={b.id} style={estilos.cartao}>
                <View style={estilos.linha}>
                  <Text style={estilos.nome}>{b.nome}</Text>
                  <Text style={[estilos.selo, b.status === 'ativo' ? estilos.ativo : estilos.inativo]}>
                    {b.status}
                  </Text>
                </View>
                <Text style={estilos.detalhe}>
                  {[b.modelo, `${b.capacidade_min} a ${b.capacidade_max} pescadores`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {b.equipamentos ? <Text style={estilos.detalhe}>{b.equipamentos}</Text> : null}

                <View style={estilos.acoes}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/agenda', params: { barco: b.id } })}
                  >
                    <Text style={estilos.link}>Agenda e preços</Text>
                  </Pressable>
                  <Pressable onPress={() => alternarStatus(b)}>
                    <Text style={estilos.linkSuave}>
                      {b.status === 'ativo' ? 'Desativar' : 'Reativar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {novo ? (
              <View style={estilos.formulario}>
                <Campo
                  rotulo="Nome do barco"
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Ex.: Tucunaré I"
                  autoCapitalize="words"
                />
                <Campo
                  rotulo="Modelo"
                  value={modelo}
                  onChangeText={setModelo}
                  placeholder="Ex.: Fibrafort 190"
                  autoCapitalize="words"
                />
                <Campo
                  rotulo="Mínimo de pescadores"
                  value={minimo}
                  onChangeText={setMinimo}
                  keyboardType="number-pad"
                />
                <Campo
                  rotulo="Máximo de pescadores"
                  value={maximo}
                  onChangeText={setMaximo}
                  placeholder="Ex.: 4"
                  keyboardType="number-pad"
                />
                <Campo
                  rotulo="Equipamentos"
                  value={equipamentos}
                  onChangeText={setEquipamentos}
                  placeholder="Sonar, motor de popa, coletes…"
                  multiline
                  numberOfLines={3}
                />

                <Botao
                  titulo="Cadastrar barco"
                  onPress={adicionar}
                  carregando={salvando}
                  desabilitado={nome.trim().length < 2 || !capacidadeValida}
                />
                {!capacidadeValida && maximo !== '' && (
                  <Text style={estilos.dica}>
                    O máximo precisa ser um número inteiro maior ou igual ao mínimo.
                  </Text>
                )}
                <Pressable onPress={() => setNovo(false)} style={estilos.cancelar}>
                  <Text style={estilos.linkSuave}>Cancelar</Text>
                </Pressable>
              </View>
            ) : (
              <Botao titulo="Cadastrar um barco" onPress={() => setNovo(true)} />
            )}
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
    aviso: {
      backgroundColor: cores.superficieAlta,
      borderColor: cores.aviso,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    avisoTexto: { color: cores.texto, lineHeight: 20 },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    nome: { fontSize: 16, fontWeight: '700', color: cores.texto, flexShrink: 1 },
    selo: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    ativo: { backgroundColor: cores.acentoSuave, color: cores.acento },
    inativo: { backgroundColor: cores.superficieAlta, color: cores.textoSuave },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 4 },
    acoes: { flexDirection: 'row', gap: 20, marginTop: 12 },
    link: { color: cores.acento, fontWeight: '700' },
    linkSuave: { color: cores.textoSuave, fontWeight: '600' },
    formulario: { marginTop: 8 },
    dica: { color: cores.textoSuave, fontSize: 13, marginTop: 10, textAlign: 'center' },
    cancelar: { marginTop: 16, alignItems: 'center' },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
