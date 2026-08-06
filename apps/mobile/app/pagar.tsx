/**
 * Pagamento de uma reserva.
 *
 * A tela existe para a pessoa saber exatamente o que vai pagar ANTES de sair do
 * aplicativo. Botão que leva direto ao Mercado Pago sem mostrar o valor é como
 * assinar um papel dobrado.
 *
 * O valor mostrado aqui é o que o servidor já calculou e congelou na reserva —
 * a tela lê, não soma. E a escolha entre sinal e pagamento integral fica com
 * quem paga: quitar tudo agora poupa uma cobrança e um vencimento, mas amarra
 * mais dinheiro; pagar só o sinal segura a data com menos.
 *
 * A contagem do tempo que resta é a parte mais importante para uma reserva
 * ainda pendente: a data só fica presa por alguns minutos, e quem não vê o
 * relógio correndo descobre que perdeu o dia quando volta.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import { rotuloDaHora } from '@pescavertical/core/hora';
import { mensagemDeErro } from '@/lib/erros';
import { pagar, type TipoDeCobranca } from '@/lib/pagamentos';
import { minhasReservas, paraBR, type MinhaReserva } from '@/lib/reservas';
import { Botao, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { Respirar, Surgir } from '@/ui/movimento';
import { useTema, type Cores } from '@/ui/tema';

/** Quanto falta para a reserva pendente expirar, em texto curto. */
function tempoRestante(expiraEm: string | null, agora: number): string | null {
  if (!expiraEm) return null;
  const restam = new Date(expiraEm).getTime() - agora;
  if (restam <= 0) return 'expirada';
  const minutos = Math.floor(restam / 60000);
  const segundos = Math.floor((restam % 60000) / 1000);
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

export default function Pagar() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reserva: reservaId, tipo } = useLocalSearchParams<{
    reserva: string;
    tipo?: TipoDeCobranca;
  }>();

  const [reserva, setReserva] = useState<MinhaReserva | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  // Escolha do pagador quando a reserva ainda não teve o sinal pago. Vem do
  // endereço quando a tela anterior já decidiu; senão nasce no sinal, que é o
  // caminho de menor compromisso.
  const [escolha, setEscolha] = useState<TipoDeCobranca>(tipo === 'integral' ? 'integral' : 'sinal');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const todas = await minhasReservas();
      setReserva(todas.find((r) => r.id === reservaId) ?? null);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar esta reserva.'));
    } finally {
      setCarregando(false);
    }
  }, [reservaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O relógio só corre enquanto há prazo para correr.
  useEffect(() => {
    if (!reserva?.expira_em || reserva.status !== 'pendente') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [reserva?.expira_em, reserva?.status]);

  const cobranca: TipoDeCobranca | null = !reserva
    ? null
    : reserva.status_pagamento === 'aguardando_sinal'
      ? escolha
      : reserva.status_pagamento === 'sinal_pago'
        ? 'saldo'
        : null;

  const valor = !reserva || !cobranca
    ? 0
    : cobranca === 'sinal'
      ? reserva.sinal_centavos
      : cobranca === 'saldo'
        ? reserva.saldo_centavos
        : reserva.valor_total_centavos - reserva.desconto_centavos;

  async function ir() {
    if (!reserva || !cobranca) return;
    setErro(null);
    setEnviando(true);
    try {
      await pagar(reserva.id, cobranca);
      // Na web a linha acima troca de página e nada abaixo executa. No celular
      // o navegador abre por cima e o aplicativo continua vivo aqui — daí a
      // volta para a lista, que relê o estado do banco.
      router.replace('/reservas');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível abrir o pagamento.'));
      // A recusa pode ser "já foi pago" ou "o guia desconectou a conta". Nos
      // dois casos o que está na tela ficou velho.
      void carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Carregando…</Titulo>
      </ScrollView>
    );
  }

  if (!reserva) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Reserva não encontrada</Titulo>
        <Subtitulo>Ela pode ter expirado ou sido cancelada.</Subtitulo>
        <Erro mensagem={erro} />
        <Pressable onPress={() => router.replace('/reservas')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar às minhas reservas</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!cobranca) {
    return (
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
        <Titulo>Tudo pago</Titulo>
        <Subtitulo>
          Esta reserva já está quitada. Não há mais nada a pagar — leve o código {reserva.codigo}{' '}
          no dia.
        </Subtitulo>
        <Pressable onPress={() => router.replace('/reservas')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar às minhas reservas</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const liquido = reserva.valor_total_centavos - reserva.desconto_centavos;
  const relogio = tempoRestante(reserva.expira_em, agora);
  const acabou = relogio === 'expirada';

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      <Titulo>Pagamento</Titulo>
      <Subtitulo>
        {paraBR(reserva.data)} · {reserva.guia_nome} · {reserva.barco_nome}
      </Subtitulo>

      {reserva.status === 'pendente' && relogio && (
        <Surgir>
          <View style={[estilos.prazo, acabou && estilos.prazoVencido]}>
            {acabou ? (
              <Text style={estilos.prazoTexto}>
                O tempo de segurar esta data acabou. Volte e escolha o dia de novo.
              </Text>
            ) : (
              <Respirar>
                <Text style={estilos.prazoTexto}>
                  A data está reservada para você por mais {relogio}. Passado esse tempo, ela
                  volta a ficar livre para outras pessoas.
                </Text>
              </Respirar>
            )}
          </View>
        </Surgir>
      )}

      {/* A escolha só existe antes do sinal. Depois dele, o que resta é o saldo,
          e oferecer opção onde não há seria só confundir. */}
      {reserva.status_pagamento === 'aguardando_sinal' && (
        <View style={estilos.opcoes}>
          <Opcao
            escolhida={escolha === 'sinal'}
            onPress={() => setEscolha('sinal')}
            titulo="Pagar o sinal agora"
            valor={formatarBRL(reserva.sinal_centavos)}
            explicacao={`Garante a data. Os ${formatarBRL(reserva.saldo_centavos)} restantes ficam para depois${
              reserva.quitacao_vence_em ? `, até ${paraBR(reserva.quitacao_vence_em)}` : ''
            }.`}
            estilos={estilos}
          />
          <Opcao
            escolhida={escolha === 'integral'}
            onPress={() => setEscolha('integral')}
            titulo="Quitar tudo agora"
            valor={formatarBRL(liquido)}
            explicacao="Uma cobrança só, sem saldo a vencer nem lembrete para pagar depois."
            estilos={estilos}
          />
        </View>
      )}

      <View style={estilos.resumo}>
        <Text style={estilos.resumoRotulo}>
          {cobranca === 'sinal' ? 'Sinal' : cobranca === 'saldo' ? 'Saldo a quitar' : 'Valor integral'}
        </Text>
        <Text style={estilos.resumoValor}>{formatarBRL(valor)}</Text>
        {reserva.desconto_centavos > 0 && (
          <Text style={estilos.resumoNota}>
            já com {formatarBRL(reserva.desconto_centavos)} de desconto Diamond
          </Text>
        )}
        <Text style={estilos.resumoNota}>
          Pescaria de {formatarBRL(liquido)} · {reserva.qtd_pescadores}{' '}
          {reserva.qtd_pescadores === 1 ? 'pescador' : 'pescadores'} ·{' '}
          {rotuloDaHora(reserva.hora_saida)}
        </Text>
      </View>

      <Erro mensagem={erro} />

      <Botao
        titulo="Pagar com Mercado Pago"
        onPress={ir}
        carregando={enviando}
        desabilitado={acabou}
      />

      <Text style={estilos.aviso}>
        Você vai ser levado ao Mercado Pago para escolher entre Pix, cartão de crédito ou débito.
        O aplicativo não pede nem guarda número de cartão em momento nenhum.
      </Text>
      <Text style={estilos.aviso}>
        A confirmação é automática: assim que o pagamento é aprovado, a reserva aparece confirmada
        aqui — mesmo que você feche o aplicativo no meio do caminho. No Pix costuma levar poucos
        segundos.
      </Text>

      <Pressable onPress={() => router.replace('/reservas')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Agora não</Text>
      </Pressable>
    </ScrollView>
  );
}

function Opcao({
  escolhida,
  onPress,
  titulo,
  valor,
  explicacao,
  estilos,
}: {
  escolhida: boolean;
  onPress: () => void;
  titulo: string;
  valor: string;
  explicacao: string;
  estilos: ReturnType<typeof criarEstilos>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: escolhida }}
      style={[estilos.opcao, escolhida && estilos.opcaoEscolhida]}
    >
      <View style={estilos.opcaoLinha}>
        <Text style={estilos.opcaoTitulo}>{titulo}</Text>
        <Text style={estilos.opcaoValor}>{valor}</Text>
      </View>
      <Text style={estilos.opcaoExplicacao}>{explicacao}</Text>
    </Pressable>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    prazo: {
      borderWidth: 1,
      borderColor: cores.acento,
      backgroundColor: cores.acentoSuave,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    prazoVencido: { borderColor: cores.erro, backgroundColor: 'transparent' },
    prazoTexto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
    opcoes: { gap: 10, marginBottom: 20 },
    opcao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 14,
    },
    opcaoEscolhida: { borderColor: cores.acento, backgroundColor: cores.acentoSuave },
    opcaoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    opcaoTitulo: { fontSize: 15, fontWeight: '700', color: cores.texto, flexShrink: 1 },
    opcaoValor: { fontSize: 15, fontWeight: '700', color: cores.acento },
    opcaoExplicacao: { fontSize: 13, color: cores.textoSuave, marginTop: 6, lineHeight: 19 },
    resumo: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
    },
    resumoRotulo: {
      fontSize: 11,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    resumoValor: { fontSize: 32, fontWeight: '700', color: cores.texto, marginTop: 6 },
    resumoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 6, lineHeight: 19 },
    aviso: { fontSize: 13, color: cores.textoSuave, marginTop: 14, lineHeight: 19 },
    voltar: { marginTop: 24, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
