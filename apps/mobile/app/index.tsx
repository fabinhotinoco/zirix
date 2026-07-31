import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/**
 * Porteiro do aplicativo. Três estados possíveis:
 *   sem sessão            -> entrar
 *   sessão sem perfil     -> cadastro (inclui os aceites)
 *   sessão com perfil     -> início
 */
export default function Raiz() {
  const { carregando, sessao, perfil } = useAuth();

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!sessao) return <Redirect href="/entrar" />;
  if (!perfil) return <Redirect href="/cadastro" />;
  return <Redirect href="/inicio" />;
}
