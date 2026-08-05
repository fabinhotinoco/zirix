/**
 * Componentes básicos compartilhados. Sem biblioteca de interface: nesta fase,
 * um punhado de componentes próprios custa menos que uma dependência a mais.
 *
 * Nenhuma cor fixa aqui — todas vêm do tema, que resolve dia e noite antes de
 * chegar. É o que permite trocar a paleta inteira sem abrir arquivo nenhum.
 *
 * O estilo é seco de propósito: traço fino, muito espaço, uma cor de destaque
 * só. Sombra e gradiente envelhecem rápido e cobram caro em desempenho; espaço
 * em branco, não.
 */

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type { ReactNode } from 'react';

import { Ondas } from './movimento';
import { useTema, type Cores } from './tema';

/**
 * Título de tela, com a faixa de água por baixo.
 *
 * A onda mora aqui, e não em cada tela, para que a assinatura visual seja a
 * mesma em todo lugar sem ninguém precisar lembrar de colocá-la — e para que
 * mudá-la um dia seja mexer num arquivo só.
 *
 * `agitacao` existe para a tela de condições passar a ondulação de verdade: a
 * água na tela fica mexida quando a água lá fora está.
 */
export function Titulo({
  children,
  agitacao,
  semOnda = false,
}: {
  children: ReactNode;
  agitacao?: number;
  semOnda?: boolean;
}) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  return (
    <View style={estilos.cabecalho}>
      <Text style={estilos.titulo}>{children}</Text>
      {!semOnda && <Ondas altura={26} agitacao={agitacao ?? 0.3} estilo={estilos.onda} />}
    </View>
  );
}

export function Subtitulo({ children }: { children: ReactNode }) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  return <Text style={estilos.subtitulo}>{children}</Text>;
}

export function Campo({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput style={estilos.entrada} placeholderTextColor={cores.textoSuave} {...props} />
    </View>
  );
}

export function Botao({
  titulo,
  onPress,
  desabilitado,
  carregando,
}: {
  titulo: string;
  onPress: () => void;
  desabilitado?: boolean;
  carregando?: boolean;
}) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inativo }}
      style={[estilos.botao, inativo && estilos.botaoInativo]}
    >
      {carregando ? (
        <ActivityIndicator color={cores.acentoTexto} />
      ) : (
        <Text style={[estilos.botaoTexto, inativo && estilos.botaoTextoInativo]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

/**
 * Caixa de aceite. Nasce **sempre desmarcada** — aceite pré-marcado não é
 * manifestação de vontade, é vício que derruba a cláusula.
 */
export function CaixaAceite({
  marcada,
  onToggle,
  children,
}: {
  marcada: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      style={estilos.aceite}
    >
      <View style={[estilos.caixa, marcada && estilos.caixaMarcada]}>
        {marcada && <Text style={estilos.caixaMarca}>✓</Text>}
      </View>
      <View style={estilos.aceiteTexto}>{children}</View>
    </Pressable>
  );
}

export function Erro({ mensagem }: { mensagem: string | null }) {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  if (!mensagem) return null;
  return <Text style={estilos.erro}>{mensagem}</Text>;
}

export const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    cabecalho: { marginBottom: 4 },
    onda: { marginTop: -6, marginBottom: 10, opacity: 0.9 },
    titulo: {
      fontSize: 28,
      fontWeight: '700',
      color: cores.texto,
      letterSpacing: -0.6,
      marginBottom: 8,
    },
    subtitulo: { fontSize: 15, color: cores.textoSuave, marginBottom: 26, lineHeight: 22 },
    campo: { marginBottom: 16 },
    rotulo: {
      fontSize: 11,
      fontWeight: '700',
      color: cores.textoSuave,
      marginBottom: 7,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    entrada: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: cores.texto,
      backgroundColor: cores.superficieAlta,
    },
    botao: {
      backgroundColor: cores.acento,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    botaoInativo: { backgroundColor: cores.superficieAlta, borderWidth: 1, borderColor: cores.borda },
    // Branco sobre cinza claro dá contraste de ~1,4:1 — o texto some e o botão
    // vira um retângulo vazio. Foi assim que a tela do código virou "dois
    // colchetes" para quem estava usando. Hoje o teste de contraste em
    // packages/core/test/tema.test.ts barra isso antes de subir.
    botaoTexto: { color: cores.acentoTexto, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    botaoTextoInativo: { color: cores.textoSuave },
    aceite: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
    caixa: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: cores.borda,
      backgroundColor: cores.superficieAlta,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    caixaMarcada: { backgroundColor: cores.acento, borderColor: cores.acento },
    caixaMarca: { color: cores.acentoTexto, fontSize: 15, fontWeight: '700', lineHeight: 18 },
    aceiteTexto: { flex: 1 },
    erro: { color: cores.erro, fontSize: 14, marginTop: 12, lineHeight: 20 },
  });
