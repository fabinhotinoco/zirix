/**
 * Leitura do texto completo de um documento legal.
 *
 * O texto vem do banco, não do binário: assim uma nova versão publicada no
 * painel aparece na hora, sem depender de atualização na loja.
 */

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buscarTextoDocumento, type DocumentoSlug } from '@/lib/legal';
import { Erro } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Documento() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug, versao } = useLocalSearchParams<{ slug: string; versao: string }>();

  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarTextoDocumento(slug as DocumentoSlug, versao)
      .then(setTexto)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir o documento.'));
  }, [slug, versao]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[estilos.barra, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={estilos.voltar}>← Voltar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={estilos.conteudo}>
        {erro ? (
          <Erro mensagem={erro} />
        ) : texto === null ? (
          <ActivityIndicator />
        ) : (
          <Text style={estilos.texto}>{texto}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    barra: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: cores.borda,
    },
    voltar: { color: cores.acento, fontSize: 16, fontWeight: '600' },
    conteudo: { padding: 20, paddingBottom: 64 },
    texto: { fontSize: 14, lineHeight: 22, color: cores.texto },
  });
