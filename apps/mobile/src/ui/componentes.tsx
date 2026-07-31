/**
 * Componentes básicos compartilhados. Sem biblioteca de UI: nesta fase, um
 * punhado de componentes próprios custa menos que uma dependência a mais.
 */

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

export const cores = {
  agua: '#0B6E8F',
  aguaClara: '#E6F4FE',
  texto: '#12212B',
  suave: '#5A6B76',
  borda: '#D3DEE5',
  erro: '#B3261E',
  fundo: '#FFFFFF',
} as const;

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={estilos.titulo}>{children}</Text>;
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <Text style={estilos.subtitulo}>{children}</Text>;
}

export function Campo({
  rotulo,
  ...props
}: TextInputProps & { rotulo: string }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        style={estilos.entrada}
        placeholderTextColor={cores.suave}
        {...props}
      />
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
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={estilos.botaoTexto}>{titulo}</Text>
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
  if (!mensagem) return null;
  return <Text style={estilos.erro}>{mensagem}</Text>;
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 26, fontWeight: '700', color: cores.texto, marginBottom: 6 },
  subtitulo: { fontSize: 15, color: cores.suave, marginBottom: 24, lineHeight: 21 },
  campo: { marginBottom: 16 },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  entrada: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  botao: {
    backgroundColor: cores.agua,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  botaoInativo: { backgroundColor: cores.borda },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aceite: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  caixa: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  caixaMarcada: { backgroundColor: cores.agua, borderColor: cores.agua },
  caixaMarca: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 18 },
  aceiteTexto: { flex: 1 },
  erro: { color: cores.erro, fontSize: 14, marginTop: 12, lineHeight: 20 },
});
