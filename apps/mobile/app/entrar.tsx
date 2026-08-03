/**
 * Entrada por código de uso único.
 *
 * Telefone é o caminho pretendido, mas depende de um provedor de SMS
 * configurado no Supabase. Enquanto isso não existe, o e-mail permite testar
 * o fluxo inteiro — e continua útil depois, como alternativa para quem trocar
 * de número.
 */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/lib/supabase';
import { Botao, Campo, Erro, Subtitulo, Titulo, cores } from '@/ui/componentes';

type Meio = 'telefone' | 'email';
type Etapa = 'identificacao' | 'codigo';

/** O Supabase espera E.164: +5511987654321. */
function paraE164(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  if (digitos.length === 12 || digitos.length === 13) return `+${digitos}`;
  return null;
}

export default function Entrar() {
  const insets = useSafeAreaInsets();
  const [meio, setMeio] = useState<Meio>('email');
  const [etapa, setEtapa] = useState<Etapa>('identificacao');
  const [valor, setValor] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Sem um caminho de volta, quem não recebe o código fica olhando para a tela
  // sem nada para fazer. A espera evita que reenviar vire o próprio problema:
  // cada pedido novo invalida o código anterior e consome a cota de e-mails.
  const [esperaReenvio, setEsperaReenvio] = useState(0);

  async function enviarCodigo() {
    setErro(null);
    setEnviando(true);
    try {
      if (meio === 'telefone') {
        const telefone = paraE164(valor);
        if (!telefone) throw new Error('Informe o telefone com DDD, por exemplo 11 98765-4321.');
        const { error } = await supabase.auth.signInWithOtp({ phone: telefone });
        if (error) throw error;
      } else {
        if (!valor.includes('@')) throw new Error('Informe um e-mail válido.');
        const { error } = await supabase.auth.signInWithOtp({
          email: valor.trim(),
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      }
      setEtapa('codigo');
      setEsperaReenvio(60);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível enviar o código.'));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarCodigo() {
    setErro(null);
    setEnviando(true);
    try {
      if (meio === 'telefone') {
        const { error } = await supabase.auth.verifyOtp({
          phone: paraE164(valor)!,
          token: codigo.trim(),
          type: 'sms',
        });
        if (error) throw error;
      } else {
        // O Supabase emite o código por dois caminhos diferentes conforme o
        // endereço já exista ou não: quem já entrou alguma vez recebe pelo
        // modelo "Magic Link" (tipo `email`); quem está entrando pela primeira
        // vez recebe pelo "Confirm signup" (tipo `signup`). O tipo errado é
        // recusado com a mesma mensagem de código expirado, o que faz parecer
        // problema de prazo quando é de classificação.
        //
        // Não dá para saber de fora qual dos dois é — a existência da conta é
        // justamente o que o Supabase não revela antes do login. Então tenta um
        // e, se for recusado, tenta o outro.
        const email = valor.trim();
        const token = codigo.trim();

        const primeira = await supabase.auth.verifyOtp({ email, token, type: 'email' });
        if (primeira.error) {
          const segunda = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
          if (segunda.error) throw primeira.error;
        }
      }
      // O redirecionamento acontece sozinho: a sessão muda e app/index reavalia.
    } catch (e) {
      setErro(mensagemDeErro(e, 'Código inválido ou expirado.'));
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const id = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [esperaReenvio]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titulo>PescaVerticalAPP</Titulo>

        {etapa === 'identificacao' ? (
          <>
            <Subtitulo>
              Enviamos um código de uso único para você entrar. Sem senha para esquecer.
            </Subtitulo>

            <View style={estilos.abas}>
              {(['email', 'telefone'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setMeio(m);
                    setValor('');
                    setErro(null);
                  }}
                  style={[estilos.aba, meio === m && estilos.abaAtiva]}
                >
                  <Text style={[estilos.abaTexto, meio === m && estilos.abaTextoAtivo]}>
                    {m === 'email' ? 'E-mail' : 'Telefone'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {meio === 'email' ? (
              <Campo
                rotulo="Seu e-mail"
                value={valor}
                onChangeText={setValor}
                placeholder="voce@exemplo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            ) : (
              <Campo
                rotulo="Seu telefone"
                value={valor}
                onChangeText={setValor}
                placeholder="(11) 98765-4321"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            )}

            <Botao
              titulo="Receber código"
              onPress={enviarCodigo}
              carregando={enviando}
              desabilitado={valor.trim().length < 5}
            />
          </>
        ) : (
          <>
            <Subtitulo>Digite o código de 6 dígitos que enviamos para {valor}.</Subtitulo>

            <Campo
              rotulo="Código"
              value={codigo}
              onChangeText={setCodigo}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
            />

            <Botao
              titulo="Entrar"
              onPress={confirmarCodigo}
              carregando={enviando}
              desabilitado={codigo.trim().length < 6}
            />

            <Text style={estilos.ajuda}>
              Não chegou? Confira a caixa de spam. O código vale por uma hora, e
              pedir outro invalida o anterior.
            </Text>

            <Pressable
              onPress={() => void enviarCodigo()}
              disabled={esperaReenvio > 0 || enviando}
              style={estilos.voltar}
            >
              <Text style={[estilos.voltarTexto, esperaReenvio > 0 && estilos.voltarTextoInativo]}>
                {esperaReenvio > 0
                  ? `Enviar outro código em ${esperaReenvio}s`
                  : 'Enviar outro código'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setEtapa('identificacao');
                setCodigo('');
                setErro(null);
              }}
              style={estilos.voltar}
            >
              <Text style={estilos.voltarTexto}>Corrigir {meio === 'email' ? 'e-mail' : 'telefone'}</Text>
            </Pressable>
          </>
        )}

        <Erro mensagem={erro} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 48 },
  abas: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  aba: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cores.borda,
    alignItems: 'center',
  },
  abaAtiva: { backgroundColor: cores.aguaClara, borderColor: cores.agua },
  abaTexto: { color: cores.suave, fontWeight: '600' },
  abaTextoAtivo: { color: cores.agua },
  ajuda: { fontSize: 13, color: cores.suave, lineHeight: 19, marginTop: 16, textAlign: 'center' },
  voltar: { marginTop: 18, alignItems: 'center' },
  voltarTexto: { color: cores.agua, fontWeight: '600' },
  voltarTextoInativo: { color: cores.suave },
});
