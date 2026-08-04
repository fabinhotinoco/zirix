import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { Subtitulo, Titulo, cores } from '@/ui/componentes';

/** Placeholder do início. A agenda entra na próxima fase. */
export default function Inicio() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

      {perfil?.role === 'master' && (
        <Pressable onPress={() => router.push('/guias')} style={estilos.acao}>
          <Text style={estilos.acaoTexto}>Guias da plataforma</Text>
          <Text style={estilos.acaoNota}>Aprovar inscrições e definir comissões</Text>
        </Pressable>
      )}

      {perfil?.role === 'guia' && (
        <>
          <Pressable onPress={() => router.push('/guia')} style={estilos.acao}>
            <Text style={estilos.acaoTexto}>Minha operação</Text>
            <Text style={estilos.acaoNota}>Situação da inscrição e dados da operação</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/barcos')} style={estilos.acao}>
            <Text style={estilos.acaoTexto}>Meus barcos</Text>
            <Text style={estilos.acaoNota}>Frota, agenda e preços de cada dia</Text>
          </Pressable>
        </>
      )}

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
  acao: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: cores.agua,
    backgroundColor: cores.aguaClara,
    borderRadius: 12,
    padding: 16,
  },
  acaoTexto: { fontSize: 16, fontWeight: '700', color: cores.agua },
  acaoNota: { fontSize: 13, color: cores.suave, marginTop: 2 },
  sair: { marginTop: 28, alignItems: 'center' },
  sairTexto: { color: cores.agua, fontWeight: '600' },
});
