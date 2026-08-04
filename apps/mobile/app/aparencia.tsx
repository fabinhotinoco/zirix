/**
 * Aparência: modo de exibição e paleta da marca.
 *
 * A paleta fica escolhível enquanto a marca não estiver decidida. Quando você
 * escolher, esta parte da tela vira uma linha só — a paleta passa a ser
 * definida no código e some daqui. Deixar o cliente escolher a cor da marca
 * seria abrir mão da própria identidade.
 *
 * O modo de exibição fica para sempre: é preferência de quem usa, não da marca.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coresDe, type ModoDeTema } from '@pescavertical/core/tema';
import { Marca, Simbolo } from '@/ui/logo';
import { Subtitulo, Titulo } from '@/ui/componentes';
import { PALETAS, useTema, type Cores } from '@/ui/tema';

const MODOS: { chave: ModoDeTema; nome: string; nota: string }[] = [
  { chave: 'dia', nome: 'Dia', nota: 'Claro sempre, mesmo à noite' },
  { chave: 'noite', nome: 'Noite', nota: 'Escuro sempre — bom para madrugada de saída' },
  { chave: 'hibrido', nome: 'Híbrido', nota: 'Acompanha o aparelho: claro de dia, escuro à noite' },
];

export default function Aparencia() {
  const { cores, modo, paleta, aparencia, definirModo, definirPaleta } = useTema();
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
        Como o aplicativo se apresenta. A mudança vale na hora e fica guardada neste aparelho.
      </Subtitulo>

      <Text style={estilos.secao}>Modo de exibição</Text>
      {MODOS.map((m) => (
        <Pressable
          key={m.chave}
          onPress={() => definirModo(m.chave)}
          accessibilityRole="radio"
          accessibilityState={{ selected: modo === m.chave }}
          style={[estilos.opcao, modo === m.chave && estilos.opcaoAtiva]}
        >
          <View style={estilos.radio}>
            {modo === m.chave && <View style={estilos.radioCheio} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.opcaoNome}>{m.nome}</Text>
            <Text style={estilos.opcaoNota}>{m.nota}</Text>
          </View>
        </Pressable>
      ))}

      {modo === 'hibrido' && (
        <Text style={estilos.dica}>
          Agora o aparelho está no modo {aparencia === 'noite' ? 'escuro' : 'claro'}.
        </Text>
      )}

      <Text style={estilos.secao}>Cores da marca</Text>
      <Text style={estilos.aviso}>
        Ainda não decidido. Experimente as três e me diga qual fica — depois disso a escolhida
        passa a ser fixa e esta parte sai da tela.
      </Text>

      {PALETAS.map((p) => {
        const escolhida = paleta.nome === p.nome;
        // Cada cartão mostra a paleta NELA MESMA, não no tema em uso: comparar
        // três amostras pintadas com a cor atual não compara coisa nenhuma.
        const c = coresDe(p, aparencia);
        return (
          <Pressable
            key={p.nome}
            onPress={() => definirPaleta(p.nome)}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhida }}
            style={[
              estilos.paleta,
              { backgroundColor: c.superficie, borderColor: escolhida ? c.acento : c.borda },
              escolhida && estilos.paletaEscolhida,
            ]}
          >
            <View style={estilos.paletaTopo}>
              <Simbolo tamanho={34} cor={c.acento} corSuave={c.textoSuave} />
              <View style={{ flex: 1 }}>
                <Text style={[estilos.paletaNome, { color: c.texto }]}>{p.titulo}</Text>
                <Text style={[estilos.paletaIdeia, { color: c.textoSuave }]}>{p.ideia}</Text>
              </View>
            </View>

            <View style={estilos.amostras}>
              {[c.fundo, c.superficieAlta, c.acento, c.acentoSuave, c.texto].map((cor, i) => (
                <View
                  key={i}
                  style={[estilos.amostra, { backgroundColor: cor, borderColor: c.borda }]}
                />
              ))}
            </View>

            {/* Botão e selo de verdade, com as cores da paleta: é onde o
                contraste aparece ou falha, não no quadradinho de amostra. */}
            <View style={estilos.exemplo}>
              <View style={[estilos.exemploBotao, { backgroundColor: c.acento }]}>
                <Text style={[estilos.exemploBotaoTexto, { color: c.acentoTexto }]}>
                  Confirmar reserva
                </Text>
              </View>
              <Text style={[estilos.exemploSelo, { backgroundColor: c.acentoSuave, color: c.acento }]}>
                Sinal pago
              </Text>
            </View>

            <Text style={[estilos.exemploValor, { color: c.texto }]}>
              R$ 1.050,00{' '}
              <Text style={{ color: c.erro }}>· R$ 735,00 em aberto</Text>
            </Text>

            {escolhida && (
              <Text style={[estilos.escolhida, { color: c.acento }]}>Em uso agora</Text>
            )}
          </Pressable>
        );
      })}

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    marca: { alignItems: 'center', marginBottom: 28 },
    secao: {
      fontSize: 11,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 26,
      marginBottom: 12,
    },
    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 15,
      marginBottom: 9,
    },
    opcaoAtiva: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
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
    opcaoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 2 },
    dica: { fontSize: 13, color: cores.textoSuave, marginTop: 6, textAlign: 'center' },
    aviso: { fontSize: 13, color: cores.textoSuave, lineHeight: 19, marginBottom: 14 },
    paleta: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 14 },
    paletaEscolhida: { borderWidth: 2 },
    paletaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    paletaNome: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
    paletaIdeia: { fontSize: 13, lineHeight: 18, marginTop: 3 },
    amostras: { flexDirection: 'row', gap: 6, marginTop: 14 },
    amostra: { flex: 1, height: 26, borderRadius: 6, borderWidth: 1 },
    exemplo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
    exemploBotao: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    exemploBotaoTexto: { fontSize: 14, fontWeight: '700' },
    exemploSelo: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      overflow: 'hidden',
    },
    exemploValor: { fontSize: 16, fontWeight: '700', marginTop: 12 },
    escolhida: { fontSize: 12, fontWeight: '700', marginTop: 10 },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
