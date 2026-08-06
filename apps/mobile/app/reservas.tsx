/**
 * Minhas reservas.
 *
 * A lista vem da função `minhas_reservas`, e não de uma consulta com join: o
 * cliente perde o acesso ao barco assim que o guia o desativa, e a reserva
 * dele não pode virar uma linha sem nome por causa disso.
 *
 * QUEM CONFIRMA O PAGAMENTO NÃO É ESTA TELA. É o webhook do Mercado Pago, no
 * servidor, que pode chegar com o aplicativo fechado. Por isso, enquanto houver
 * reserva esperando pagamento, a tela simplesmente **pergunta ao banco de novo**
 * de tempos em tempos — em vez de acreditar no que o navegador devolveu.
 *
 * A releitura tem fim (poucas tentativas, e para quando a reserva confirma). Um
 * laço eterno bateria no banco a cada poucos segundos pelo resto do dia, para
 * quem abriu a tela e foi almoçar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL } from '@pescavertical/core/dinheiro';
import { rotuloDaHora } from '@pescavertical/core/hora';
import { mensagemDeErro } from '@/lib/erros';
import { cancelarReserva, minhasReservas, paraBR, type MinhaReserva } from '@/lib/reservas';
import { Vitrine } from '@/ui/vitrine';
import { Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

const ROTULO_STATUS: Record<MinhaReserva['status'], string> = {
  pendente: 'Aguardando pagamento',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

const ROTULO_PAGAMENTO: Record<MinhaReserva['status_pagamento'], string> = {
  aguardando_sinal: 'Sinal ainda não pago',
  sinal_pago: 'Sinal pago — falta o saldo',
  quitada: 'Tudo pago',
};

export default function Reservas() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [reservas, setReservas] = useState<MinhaReserva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [desistindo, setDesistindo] = useState<string | null>(null);

  // `silencioso` é para a releitura automática: trocar a lista por "Carregando…"
  // a cada oito segundos faria a tela piscar na cara de quem está só esperando a
  // confirmação chegar.
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro(null);
    try {
      setReservas(await minhasReservas());
    } catch (e) {
      if (!silencioso) setErro(mensagemDeErro(e, 'Não foi possível carregar suas reservas.'));
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ---------------------------------------------------------------------------
  // Releitura enquanto houver pagamento a caminho.
  //
  // Quem volta do Mercado Pago cai aqui, e o webhook pode ainda não ter chegado
  // — no Pix costuma ser questão de segundos. Sem isto, a pessoa veria "sinal
  // ainda não pago" logo depois de pagar e concluiria que o dinheiro sumiu.
  // ---------------------------------------------------------------------------
  const esperando = reservas.some(
    (r) =>
      (r.status === 'pendente' || r.status === 'confirmada')
      && r.status_pagamento !== 'quitada',
  );
  const tentativas = useRef(0);

  useEffect(() => {
    if (carregando || !esperando) return;
    if (tentativas.current >= 10) return;
    const t = setTimeout(() => {
      tentativas.current += 1;
      void carregar(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [carregando, esperando, reservas, carregar]);

  async function desistir(r: MinhaReserva) {
    setErro(null);
    setDesistindo(r.id);
    try {
      await cancelarReserva(r.id);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível desfazer esta reserva.'));
    } finally {
      setDesistindo(null);
    }
  }

  const ativas = reservas.filter((r) => r.status === 'pendente' || r.status === 'confirmada');
  const encerradas = reservas.filter((r) => r.status === 'cancelada' || r.status === 'expirada');

  function cartao(r: MinhaReserva, encerrada: boolean) {
    const liquido = r.valor_total_centavos - r.desconto_centavos;
    return (
      <View key={r.id} style={[estilos.cartao, encerrada && estilos.cartaoApagado]}>
        <View style={estilos.linha}>
          <Text style={estilos.data}>{paraBR(r.data)}</Text>
          <Text
            style={[
              estilos.selo,
              r.status === 'confirmada' ? estilos.seloBom : estilos.seloNeutro,
            ]}
          >
            {ROTULO_STATUS[r.status]}
          </Text>
        </View>

        <Text style={estilos.guia}>
          {r.guia_nome}
          {r.guia_cidade ? ` · ${r.guia_cidade}` : ''}
        </Text>
        <Text style={estilos.detalhe}>
          {r.barco_nome} · {r.qtd_pescadores}{' '}
          {r.qtd_pescadores === 1 ? 'pescador' : 'pescadores'}
        </Text>
        {!encerrada && (
          <Text style={estilos.hora}>
            {rotuloDaHora(r.hora_saida)}
            {r.observacao ? ` · ${r.observacao}` : ''}
          </Text>
        )}
        {r.codigo ? <Text style={estilos.codigo}>Código {r.codigo}</Text> : null}

        <View style={estilos.valores}>
          <Text style={estilos.valorTotal}>{formatarBRL(liquido)}</Text>
          {r.desconto_centavos > 0 && (
            <Text style={estilos.desconto}>
              já com {formatarBRL(r.desconto_centavos)} de desconto Diamond
            </Text>
          )}
          {!encerrada && (
            <>
              <Text style={estilos.detalhe}>
                Sinal {formatarBRL(r.sinal_centavos)} · Saldo {formatarBRL(r.saldo_centavos)}
              </Text>
              <Text style={estilos.detalhe}>{ROTULO_PAGAMENTO[r.status_pagamento]}</Text>
              {r.quitacao_vence_em && r.status_pagamento !== 'quitada' && (
                <Text style={estilos.detalhe}>
                  Saldo vence em {paraBR(r.quitacao_vence_em)}
                </Text>
              )}
            </>
          )}
        </View>

        {r.participantes.length > 0 && (
          <Text style={estilos.detalhe}>
            Com você: {r.participantes.map((p) => p.nome).join(', ')}
          </Text>
        )}

        {/* O botão só aparece onde há o que pagar. Reserva quitada com botão de
            pagar é convite a pagar duas vezes — e o servidor recusaria, mas com
            uma mensagem que a pessoa não deveria precisar ler. */}
        {!encerrada && r.status_pagamento !== 'quitada' && (
          <Pressable
            onPress={() => router.push({ pathname: '/pagar', params: { reserva: r.id } })}
            style={estilos.pagar}
          >
            <Text style={estilos.pagarTexto}>
              {r.status_pagamento === 'aguardando_sinal'
                ? `Pagar o sinal · ${formatarBRL(r.sinal_centavos)}`
                : `Quitar o saldo · ${formatarBRL(r.saldo_centavos)}`}
            </Text>
          </Pressable>
        )}

        {!encerrada && r.status_pagamento === 'aguardando_sinal' && (
          <Pressable onPress={() => desistir(r)} disabled={desistindo === r.id}>
            <Text style={estilos.desistir}>
              {desistindo === r.id ? 'Desfazendo…' : 'Desistir desta reserva'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}>
      <Titulo>Minhas reservas</Titulo>
      <Subtitulo>
        O pagamento é todo pelo aplicativo, por Pix ou cartão. Nada em dinheiro no dia — o
        que estiver pago aparece aqui, e o guia vê o mesmo.
      </Subtitulo>

      <Erro mensagem={erro} />

      {carregando ? (
        <Text style={estilos.vazio}>Carregando…</Text>
      ) : reservas.length === 0 ? (
        <>
          <Text style={estilos.vazio}>Você ainda não reservou nenhuma pescaria.</Text>
          <Pressable onPress={() => router.push('/buscar')} style={estilos.acao}>
            <Text style={estilos.acaoTexto}>Procurar um guia</Text>
          </Pressable>
        </>
      ) : (
        <>
          {ativas.map((r) => cartao(r, false))}
          {encerradas.length > 0 && (
            <>
              <Text style={estilos.secao}>Encerradas</Text>
              {encerradas.map((r) => cartao(r, true))}
            </>
          )}
        </>
      )}

      {/* A releitura automática para depois de um tempo. Quem pagou por boleto,
          ou por Pix que demorou, precisa de um jeito de pedir de novo sem
          fechar e reabrir o aplicativo. */}
      {!carregando && esperando && (
        <Pressable onPress={() => void carregar()} style={estilos.conferir}>
          <Text style={estilos.conferirTexto}>Já paguei — conferir agora</Text>
        </Pressable>
      )}

      {/* Quem acabou de fechar uma pescaria é quem mais quer equipamento. */}
      <Vitrine />

      <Pressable onPress={() => router.replace('/inicio')} style={estilos.voltar}>
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    cartao: {
      borderWidth: 1,
      borderColor: cores.borda,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cartaoApagado: { opacity: 0.6 },
    linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    data: { fontSize: 18, fontWeight: '700', color: cores.texto },
    selo: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    seloBom: { backgroundColor: cores.acentoSuave, color: cores.acento },
    seloNeutro: { backgroundColor: cores.superficieAlta, color: cores.textoSuave },
    guia: { fontSize: 15, fontWeight: '600', color: cores.texto, marginTop: 6 },
    detalhe: { fontSize: 13, color: cores.textoSuave, marginTop: 4 },
    hora: { fontSize: 13, color: cores.acento, fontWeight: '600', marginTop: 4 },
    codigo: { fontSize: 13, color: cores.textoSuave, marginTop: 4, fontWeight: '600' },
    valores: { marginTop: 12 },
    valorTotal: { fontSize: 20, fontWeight: '700', color: cores.texto },
    desconto: { fontSize: 12, color: cores.acento, marginTop: 2, fontWeight: '600' },
    pagar: {
      marginTop: 14,
      backgroundColor: cores.acento,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    pagarTexto: { color: cores.acentoTexto, fontSize: 15, fontWeight: '700' },
    desistir: { color: cores.erro, fontWeight: '600', marginTop: 14 },
    conferir: { marginTop: 16, alignItems: 'center' },
    conferirTexto: { color: cores.acento, fontWeight: '600', fontSize: 14 },
    secao: { fontSize: 15, fontWeight: '700', color: cores.texto, marginTop: 20, marginBottom: 10 },
    vazio: { color: cores.textoSuave, textAlign: 'center', lineHeight: 21 },
    acao: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: cores.acento,
      backgroundColor: cores.acentoSuave,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    acaoTexto: { fontSize: 16, fontWeight: '700', color: cores.acento },
    voltar: { marginTop: 28, alignItems: 'center' },
    voltarTexto: { color: cores.acento, fontWeight: '600' },
  });
