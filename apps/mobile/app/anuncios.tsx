/**
 * Os quatro espaços de anúncio, configurados pelo master.
 *
 * Quatro fixos, e não uma lista que cresce. A restrição é de propósito: espaço
 * de anúncio sem limite vira mural, e mural empurra a pescaria para fora da
 * tela. Quatro cabem numa dobra e obrigam a escolher os melhores parceiros.
 *
 * O link é conferido aqui e no banco. Aqui é conveniência — dizer o que está
 * errado enquanto se digita; lá é a garantia, porque o aplicativo não é o único
 * caminho até a tabela.
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

import { linkDeParceiro } from '@pescavertical/core/links';
import {
  anunciosVisiveis,
  apagarAnuncio,
  desempenhoDosAnuncios,
  salvarAnuncio,
  type Anuncio,
  type DesempenhoDoAnuncio,
} from '@/lib/anuncios';
import { mensagemDeErro } from '@/lib/erros';
import { Botao, Campo, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

const POSICOES = [1, 2, 3, 4];

interface Rascunho {
  titulo: string;
  chamada: string;
  parceiro: string;
  url: string;
  codigo: string;
  ativo: boolean;
}

const VAZIO: Rascunho = { titulo: '', chamada: '', parceiro: '', url: '', codigo: '', ativo: false };

export default function Anuncios() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rascunhos, setRascunhos] = useState<Record<number, Rascunho>>({});
  const [desempenho, setDesempenho] = useState<DesempenhoDoAnuncio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, desemp] = await Promise.all([anunciosVisiveis(), desempenhoDosAnuncios()]);
      const mapa: Record<number, Rascunho> = {};
      for (const p of POSICOES) {
        const a: Anuncio | undefined = lista.find((x) => x.posicao === p);
        mapa[p] = a
          ? {
              titulo: a.titulo,
              chamada: a.chamada ?? '',
              parceiro: a.parceiro,
              url: a.url,
              codigo: a.codigo_desconto ?? '',
              ativo: a.ativo,
            }
          : { ...VAZIO };
      }
      setRascunhos(mapa);
      setDesempenho(desemp);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os anúncios.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function editar(p: number, campo: keyof Rascunho, valor: string | boolean) {
    setRascunhos((atual) => ({ ...atual, [p]: { ...atual[p], [campo]: valor } }));
  }

  async function guardar(p: number) {
    const r = rascunhos[p];
    const url = linkDeParceiro(r.url);
    if (!url) return;
    setErro(null);
    setSalvando(p);
    try {
      await salvarAnuncio({
        posicao: p,
        titulo: r.titulo.trim(),
        chamada: r.chamada.trim() || null,
        parceiro: r.parceiro.trim(),
        url,
        codigo_desconto: r.codigo.trim().toUpperCase() || null,
        ativo: r.ativo,
      });
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar este espaço.'));
    } finally {
      setSalvando(null);
    }
  }

  async function limpar(p: number) {
    setErro(null);
    try {
      await apagarAnuncio(p);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível limpar este espaço.'));
    }
  }

  if (carregando) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Carregando…</Titulo>
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
        <Titulo>Anúncios de parceiros</Titulo>
        <Subtitulo>
          Quatro espaços no rodapé do aplicativo. São quatro de propósito: sem limite viram um
          mural, e o mural empurra a pescaria para fora da tela.
        </Subtitulo>

        {desempenho.some((d) => d.cliques > 0) && (
          <View style={estilos.painel}>
            <Text style={estilos.painelTitulo}>Cliques nos últimos 30 dias</Text>
            {desempenho.map((d) => (
              <View key={d.posicao} style={estilos.painelLinha}>
                <Text style={estilos.painelRotulo} numberOfLines={1}>
                  {d.posicao}. {d.titulo}
                  {d.ativo ? '' : ' (fora do ar)'}
                </Text>
                <Text style={estilos.painelValor}>{d.cliques}</Text>
              </View>
            ))}
            <Text style={estilos.painelNota}>
              O clique é contado sem saber quem clicou. Conferir o que foi vendido é no painel
              do parceiro — aqui só se vê o que desperta interesse.
            </Text>
          </View>
        )}

        <Erro mensagem={erro} />

        {POSICOES.map((p) => {
          const r = rascunhos[p] ?? VAZIO;
          const urlOk = linkDeParceiro(r.url) !== null;
          const preenchido = r.titulo.trim() !== '' && r.parceiro.trim() !== '' && urlOk;
          const existe = r.titulo.trim() !== '' || r.url.trim() !== '';

          return (
            <View key={p} style={estilos.espaco}>
              <View style={estilos.espacoTopo}>
                <Text style={estilos.espacoNumero}>Espaço {p}</Text>
                <Pressable
                  onPress={() => editar(p, 'ativo', !r.ativo)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: r.ativo }}
                  style={[estilos.chave, r.ativo && estilos.chaveLigada]}
                >
                  <Text style={[estilos.chaveTexto, r.ativo && estilos.chaveTextoLigada]}>
                    {r.ativo ? 'No ar' : 'Fora do ar'}
                  </Text>
                </Pressable>
              </View>

              <Campo
                rotulo="Título"
                value={r.titulo}
                onChangeText={(t) => editar(p, 'titulo', t)}
                placeholder="Ex.: Varas e molinetes"
              />
              <Campo
                rotulo="Chamada"
                value={r.chamada}
                onChangeText={(t) => editar(p, 'chamada', t)}
                placeholder="Ex.: 10% para quem vem do aplicativo"
              />
              <Campo
                rotulo="Quem vende"
                value={r.parceiro}
                onChangeText={(t) => editar(p, 'parceiro', t)}
                placeholder="Nome da loja"
              />
              <Campo
                rotulo="Link de afiliado"
                value={r.url}
                onChangeText={(t) => editar(p, 'url', t)}
                placeholder="https://loja.com.br/…?ref=pescavertical"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Campo
                rotulo="Código de desconto"
                value={r.codigo}
                onChangeText={(t) => editar(p, 'codigo', t)}
                placeholder="Ex.: PESCAVERTICAL10"
                autoCapitalize="characters"
              />

              <Botao
                titulo="Salvar este espaço"
                onPress={() => guardar(p)}
                carregando={salvando === p}
                desabilitado={!preenchido}
              />

              {r.url.trim() !== '' && !urlOk && (
                <Text style={estilos.dica}>
                  O link precisa começar com https:// e ter um domínio. Endereço sem cadeado é
                  bloqueado pelo iPhone e o botão morre sem explicar nada.
                </Text>
              )}
              {!preenchido && urlOk && (
                <Text style={estilos.dica}>Falta o título ou o nome de quem vende.</Text>
              )}

              {existe && (
                <Pressable onPress={() => limpar(p)} style={estilos.limpar}>
                  <Text style={estilos.limparTexto}>Limpar este espaço</Text>
                </Pressable>
              )}
            </View>
          );
        })}

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
    painel: {
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 15,
      marginBottom: 22,
      gap: 6,
    },
    painelTitulo: {
      fontSize: 10,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    painelLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    painelRotulo: { color: cores.textoSuave, fontSize: 14, flex: 1 },
    painelValor: { color: cores.texto, fontSize: 15, fontWeight: '700' },
    painelNota: { fontSize: 12, color: cores.textoSuave, marginTop: 8, lineHeight: 17 },
    espaco: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    espacoTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    espacoNumero: {
      fontSize: 11,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    chave: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chaveLigada: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
    chaveTexto: { fontSize: 12, fontWeight: '700', color: cores.textoSuave },
    chaveTextoLigada: { color: cores.acento },
    dica: { color: cores.textoSuave, fontSize: 13, marginTop: 10, lineHeight: 18 },
    limpar: { marginTop: 14, alignItems: 'center' },
    limparTexto: { color: cores.erro, fontWeight: '600' },
    voltar: { marginTop: 24, alignItems: 'center' },
    voltarTexto: { color: cores.textoSuave, fontWeight: '600' },
  });
