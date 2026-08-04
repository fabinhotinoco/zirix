import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/**
 * Porteiro do aplicativo. Quatro estados possíveis:
 *   sem sessão                      -> entrar
 *   sessão sem perfil               -> cadastro (inclui os aceites)
 *   perfil com documento novo       -> aceites
 *   perfil em dia                   -> início
 *
 * O terceiro caso existe porque documento legal ganha versão nova. Sem ele,
 * publicar um texto novo seria publicar para ninguém: quem já tem perfil vem
 * direto para o início e nunca mais veria uma tela de aceite — e a versão que
 * passa a valer não teria sido aceita por ninguém.
 */
export default function Raiz() {
  const { carregando, sessao, perfil, aceitesPendentes } = useAuth();

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!sessao) return <Redirect href="/entrar" />;
  if (!perfil) return <Redirect href="/cadastro" />;
  if (aceitesPendentes.length > 0) return <Redirect href="/aceites" />;
  return <Redirect href="/inicio" />;
}
