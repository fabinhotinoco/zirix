/**
 * Guias abertos na plataforma.
 *
 * Não há filtro de status aqui: a política do banco já devolve apenas as
 * operações aprovadas. Repetir a regra na tela criaria dois lugares para
 * mantê-la — e só um deles é o que protege.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensagemDeErro } from '@/lib/erros';
import { guiasAbertos, type GuiaPublico } from '@/lib/reservas';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

function combina(g: GuiaPublico, busca: string): boolean {
  const alvo = `${g.nome_operacao} ${g.cidade ?? ''}`.toLowerCase();
  return alvo.includes(busca.trim().toLowerCase());
}

export default function Buscar() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [guias, setGuias] = useState<GuiaPublico[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setGuias(await guiasAbertos());
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os guias.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const lista = guias.filter((g) => combina(g, busca));

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Titulo>Onde pescar</Titulo>
      <Subtitulo>Escolha o guia, depois o barco e o dia.</Subtitulo>

      <TextInput
        style={estilos.busca}
        value={busca}
        onChangeText={setBusca}
        placeholder="Buscar por nome ou cidade"
        placeholderTextColor={cores.textoSuave}
        autoCorrect={false}
      />

      <Erro mensagem={erro} />

      {carregando ? (
        <Text style={estilos.vazio}>Carregando…</Text>
      ) : guias.length === 0 ? (
        <Text style={estilos.vazio}>
          Nenhuma operação aberta ainda. Assim que um guia for aprovado, ele aparece aqui.
        </Text>
      ) : lista.length === 0 ? (
        <Text style={estilos.vazio}>Nada encontrado para “{busca.trim()}”.</Text>
      ) : (
        lista.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => router.push({ pathname: '/operacao', params: { guia: g.id } })}
            style={estilos.cartao}
            accessibilityRole="button"
          >
            <Text style={estilos.nome}>{g.nome_operacao}</Text>
            {g.cidade ? <Text style={estilos.cidade}>{g.cidade}</Text> : null}
            {g.bio ? (
              <Text style={estilos.bio} numberOfLines={3}>
                {g.bio}
              </Text>
            ) : null}
            <Text style={estilos.link}>Ver barcos e datas →</Text>
          </Pressable>
        ))
      )}

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    busca: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: cores.texto,
      marginBottom: 20,
    },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    nome: { fontSize: 17, fontWeight: '700', color: cores.texto },
    cidade: { fontSize: 13, color: cores.textoSuave, marginTop: 2 },
    bio: { fontSize: 14, color: cores.texto, marginTop: 8, lineHeight: 20 },
    link: { color: cores.acento, fontWeight: '700', marginTop: 12 },
    vazio: { color: cores.textoSuave, textAlign: 'center', lineHeight: 21 },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
