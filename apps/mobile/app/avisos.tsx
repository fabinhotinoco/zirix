/**
 * Avisos: o que aconteceu com as pescarias e com o dinheiro.
 *
 * Os valores mostrados são os do momento do aviso, congelados no banco. Um
 * extrato mostra o presente; um aviso é registro do passado. Se ele lesse o
 * saldo de hoje, reescreveria o que a pessoa foi avisada mês passado — e o
 * aviso deixaria de servir para conferir nada.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import { marcarLido, marcarTodosLidos, meusAvisos, type Aviso } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { Erro, Subtitulo, Titulo, cores } from '@/ui/componentes';

/** "hoje às 14:32", "ontem às 9:05", "12/03/2026". */
function quando(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dias = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `ontem às ${hora}`;
  return d.toLocaleDateString('pt-BR');
}

export default function Avisos() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setAvisos(await meusAvisos());
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar seus avisos.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const naoLidos = avisos.filter((a) => a.lida_em === null).length;

  async function lerTudo() {
    setErro(null);
    try {
      await marcarTodosLidos();
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível marcar como lidos.'));
    }
  }

  async function abrir(a: Aviso) {
    if (a.lida_em === null) {
      try {
        await marcarLido(a.id);
        setAvisos((atual) =>
          atual.map((x) => (x.id === a.id ? { ...x, lida_em: new Date().toISOString() } : x)),
        );
      } catch {
        // Falhar em marcar como lido não pode impedir de ver a reserva.
      }
    }
    if (a.booking_id) router.push('/reservas');
  }

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      <Titulo>Avisos</Titulo>
      <Subtitulo>
        Cada reserva, cancelamento e pagamento gera um aviso aqui, para você e para o outro
        lado. Os valores são os de quando o aviso saiu.
      </Subtitulo>

      {naoLidos > 0 && (
        <Pressable onPress={lerTudo} style={estilos.lerTudo}>
          <Text style={estilos.link}>Marcar os {naoLidos} como lidos</Text>
        </Pressable>
      )}

      <Erro mensagem={erro} />

      {carregando ? (
        <Text style={estilos.vazio}>Carregando…</Text>
      ) : avisos.length === 0 ? (
        <Text style={estilos.vazio}>
          Nenhum aviso ainda. Assim que houver movimento numa reserva, ele aparece aqui.
        </Text>
      ) : (
        avisos.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => abrir(a)}
            accessibilityRole="button"
            style={[estilos.cartao, a.lida_em === null && estilos.naoLido]}
          >
            <View style={estilos.topo}>
              <Text style={estilos.titulo}>{a.titulo}</Text>
              {a.lida_em === null && <View style={estilos.ponto} />}
            </View>
            <Text style={estilos.corpo}>{a.corpo}</Text>

            {a.valor_aberto_centavos !== null && (
              <View style={estilos.valores}>
                <Text style={estilos.valorRotulo}>
                  Quitado{' '}
                  <Text style={estilos.valorForte}>
                    {formatarBRL(a.valor_pago_centavos ?? 0)}
                  </Text>
                </Text>
                <Text style={estilos.valorRotulo}>
                  Em aberto{' '}
                  <Text
                    style={[
                      estilos.valorForte,
                      a.valor_aberto_centavos > 0 && estilos.emAberto,
                    ]}
                  >
                    {formatarBRL(a.valor_aberto_centavos)}
                  </Text>
                </Text>
              </View>
            )}

            <Text style={estilos.quando}>{quando(a.criado_em)}</Text>
          </Pressable>
        ))
      )}

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
  lerTudo: { alignItems: 'flex-end', marginBottom: 12 },
  link: { color: cores.agua, fontWeight: '600' },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  naoLido: { borderColor: cores.agua, backgroundColor: cores.aguaClara },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 15, fontWeight: '700', color: cores.texto, flex: 1 },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.agua },
  corpo: { fontSize: 14, color: cores.texto, lineHeight: 20, marginTop: 6 },
  valores: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  valorRotulo: { fontSize: 13, color: cores.suave },
  valorForte: { fontWeight: '700', color: cores.texto },
  emAberto: { color: cores.erro },
  quando: { fontSize: 12, color: cores.suave, marginTop: 10 },
  vazio: { color: cores.suave, textAlign: 'center', lineHeight: 21 },
  voltar: { marginTop: 28, alignItems: 'center' },
  voltarTexto: { color: cores.agua, fontWeight: '600' },
});
