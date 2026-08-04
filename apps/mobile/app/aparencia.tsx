/**
 * Aparência: como o aplicativo se apresenta neste aparelho.
 *
 * Só o modo de exibição — a cor da marca é Abissal e não se escolhe. As três
 * paletas que existiram aqui foram uma decisão de marca, tomada e encerrada;
 * deixar o cliente escolher a cor da identidade seria abrir mão dela.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coresDe, type ModoDeTema } from '@pescavertical/core/tema';
import { Marca, Simbolo } from '@/ui/logo';
import { Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

const MODOS: { chave: ModoDeTema; nome: string; nota: string }[] = [
  { chave: 'dia', nome: 'Dia', nota: 'Claro sempre, mesmo de madrugada' },
  { chave: 'noite', nome: 'Noite', nota: 'Escuro sempre — bom para a saída antes de amanhecer' },
  { chave: 'hibrido', nome: 'Híbrido', nota: 'Acompanha o aparelho: claro de dia, escuro à noite' },
];

export default function Aparencia() {
  const { cores, modo, aparencia, definirModo } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      <View style={estilos.marca}>
        <Marca tamanho={44} />
      </View>

      <Titulo>Aparência</Titulo>
      <Subtitulo>
        A mudança vale na hora e fica guardada neste aparelho. Trocar de celular ou entrar com
        outra conta não leva a escolha junto.
      </Subtitulo>

      {MODOS.map((m) => {
        // Cada opção mostra a cor que ela produz, não a cor em uso. Um seletor
        // pintado com o tema atual não deixa comparar coisa nenhuma.
        const c = coresDe(m.chave === 'hibrido' ? aparencia : m.chave);
        const escolhido = modo === m.chave;
        return (
          <Pressable
            key={m.chave}
            onPress={() => definirModo(m.chave)}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhido }}
            style={[estilos.opcao, escolhido && estilos.opcaoAtiva]}
          >
            <View style={estilos.radio}>{escolhido && <View style={estilos.radioCheio} />}</View>

            <View style={{ flex: 1 }}>
              <Text style={estilos.opcaoNome}>{m.nome}</Text>
              <Text style={estilos.opcaoNota}>{m.nota}</Text>
            </View>

            <View style={[estilos.amostra, { backgroundColor: c.fundo, borderColor: c.borda }]}>
              <Simbolo tamanho={20} cor={c.acento} corSuave={c.textoSuave} />
              <View style={[estilos.amostraBarra, { backgroundColor: c.acento }]} />
              <View style={[estilos.amostraLinha, { backgroundColor: c.textoSuave }]} />
            </View>
          </Pressable>
        );
      })}

      {modo === 'hibrido' && (
        <Text style={estilos.dica}>
          Agora o aparelho está no modo {aparencia === 'noite' ? 'escuro' : 'claro'}.
        </Text>
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
    marca: { alignItems: 'center', marginBottom: 30 },
    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 14,
      padding: 15,
      marginBottom: 10,
    },
    opcaoAtiva: { borderColor: cores.acento },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: cores.acento,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCheio: { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.acento },
    opcaoNome: { fontSize: 16, fontWeight: '700', color: cores.texto },
    opcaoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 2, lineHeight: 18 },
    amostra: {
      width: 58,
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 9,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 5,
    },
    amostraBarra: { height: 5, borderRadius: 3, alignSelf: 'stretch' },
    amostraLinha: { height: 3, borderRadius: 2, alignSelf: 'stretch', opacity: 0.5 },
    dica: { fontSize: 13, color: cores.textoSuave, marginTop: 8, textAlign: 'center' },
    voltar: { marginTop: 30, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
