import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { Subtitulo, Titulo, cores } from '@/ui/componentes';

/** Placeholder do início. A agenda entra na próxima fase. */
export default function Inicio() {
  const insets = useSafeAreaInsets();
  const { perfil, sair } = useAuth();

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      <Titulo>Olá, {perfil?.nome.split(' ')[0]}</Titulo>
      <Subtitulo>
        Cadastro concluído e aceites registrados. A agenda de pescarias entra na próxima etapa.
      </Subtitulo>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Perfil</Text>
        <Text style={estilos.valor}>{perfil?.nome}</Text>
        <Text style={estilos.rotulo}>Papel</Text>
        <Text style={estilos.valor}>
          {perfil?.role === 'guia' ? 'Guia de pesca' : perfil?.role === 'master' ? 'Administrador' : 'Pescador'}
        </Text>
      </View>

      <Pressable onPress={sair} style={estilos.sair}>
        <Text style={estilos.sairTexto}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 48 },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  rotulo: { fontSize: 12, color: cores.suave, marginTop: 8 },
  valor: { fontSize: 16, color: cores.texto, fontWeight: '600' },
  sair: { marginTop: 28, alignItems: 'center' },
  sairTexto: { color: cores.agua, fontWeight: '600' },
});
