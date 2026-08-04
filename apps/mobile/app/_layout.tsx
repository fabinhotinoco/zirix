import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider } from '@/lib/auth';
import { TemaProvider, useTema } from '@/ui/tema';

/**
 * O tema fica por fora do login: a cor da tela de entrada também é escolha da
 * pessoa, e trocar de conta não pode devolver o aplicativo ao branco.
 */
export default function Layout() {
  return (
    <SafeAreaProvider>
      <TemaProvider>
        <AuthProvider>
          <Pintado />
        </AuthProvider>
      </TemaProvider>
    </SafeAreaProvider>
  );
}

function Pintado() {
  const { cores, aparencia, pronto } = useTema();

  return (
    // O fundo vai também no View de trás: sem ele, o espaço além do conteúdo
    // rolável fica branco no modo noite — e a emenda aparece ao arrastar.
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      {/* Barra de status ao contrário do fundo, senão os ícones do sistema
          somem: relógio preto sobre tela preta. */}
      <StatusBar style={aparencia === 'noite' ? 'light' : 'dark'} />
      {pronto && (
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}
        />
      )}
    </View>
  );
}
