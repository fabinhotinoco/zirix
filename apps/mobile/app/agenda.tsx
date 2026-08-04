/**
 * Agenda de um barco: abrir datas e definir o preço de cada dia.
 *
 * O preço vive no dia, não no barco, de propósito: feriado, alta temporada e
 * dia de semana valem valores diferentes, e amarrar o preço ao barco obrigaria
 * a mudar o cadastro toda vez — mudando junto o preço de datas já abertas.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatarBRL, paraCentavos } from '@pescavertical/core/dinheiro';
import { abrirDia, agendaDoBarco, fecharDia, type DiaDaAgenda } from '@/lib/barcos';
import { mensagemDeErro } from '@/lib/erros';
import { Botao, Campo, Erro, Subtitulo, Titulo, cores } from '@/ui/componentes';

/** dd/mm/aaaa para o formato do banco, ou null se a data não existir. */
function paraISO(bruto: string): string | null {
  const m = bruto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  // O construtor de data aceita 31/02 e devolve 03/03 calado. Comparar de volta
  // é o que separa uma data que existe de uma que foi inventada.
  const dt = new Date(`${iso}T12:00:00`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

function paraBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export default function Agenda() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { barco } = useLocalSearchParams<{ barco: string }>();

  const [dias, setDias] = useState<DiaDaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [data, setData] = useState('');
  const [precoBarco, setPrecoBarco] = useState('');
  const [precoPassageiro, setPrecoPassageiro] = useState('');
  const [observacao, setObservacao] = useState('');

  const carregar = useCallback(async () => {
    if (!barco) return;
    setCarregando(true);
    setErro(null);
    try {
      setDias(await agendaDoBarco(barco));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar a agenda.'));
    } finally {
      setCarregando(false);
    }
  }, [barco]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const iso = paraISO(data);
  const centavosBarco = precoBarco.trim() === '' ? 0 : paraCentavos(precoBarco);
  const centavosPassageiro = precoPassageiro.trim() === '' ? 0 : paraCentavos(precoPassageiro);

  const precosLidos = centavosBarco !== null && centavosPassageiro !== null;
  // O banco recusa dia sem preço nenhum; melhor dizer isso aqui do que deixar
  // a pessoa levar um erro de restrição na cara.
  const temAlgumPreco = precosLidos && centavosBarco + centavosPassageiro > 0;
  const podeAbrir = iso !== null && temAlgumPreco && !salvando;

  async function abrir() {
    if (!barco || !iso || !precosLidos) return;
    setErro(null);
    setSalvando(true);
    try {
      await abrirDia({
        boat_id: barco,
        data: iso,
        preco_barco_centavos: centavosBarco,
        preco_passageiro_centavos: centavosPassageiro,
        observacao: observacao.trim() || null,
      });
      setData('');
      setObservacao('');
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível abrir a data.'));
    } finally {
      setSalvando(false);
    }
  }

  async function fechar(dia: DiaDaAgenda) {
    setErro(null);
    try {
      await fecharDia(dia.boat_id, dia.data);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível fechar a data.'));
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titulo>Agenda</Titulo>
        <Subtitulo>
          Abra as datas em que este barco sai e diga quanto custa cada dia. Preço por dia,
          por pescador, ou os dois somados.
        </Subtitulo>

        <View style={estilos.formulario}>
          <Campo
            rotulo="Data"
            value={data}
            onChangeText={setData}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
          />
          <Campo
            rotulo="Valor do dia (barco fechado)"
            value={precoBarco}
            onChangeText={setPrecoBarco}
            placeholder="Ex.: 600,00 — deixe vazio se cobra só por pescador"
            keyboardType="decimal-pad"
          />
          <Campo
            rotulo="Valor por pescador"
            value={precoPassageiro}
            onChangeText={setPrecoPassageiro}
            placeholder="Ex.: 150,00 — deixe vazio se cobra só o dia"
            keyboardType="decimal-pad"
          />
          <Campo
            rotulo="Observação"
            value={observacao}
            onChangeText={setObservacao}
            placeholder="Ponto de encontro, horário…"
          />

          {precosLidos && temAlgumPreco && (
            <Text style={estilos.previa}>
              Um grupo de 4 pescadores pagaria{' '}
              {formatarBRL(centavosBarco + centavosPassageiro * 4)}.
            </Text>
          )}

          <Botao titulo="Abrir esta data" onPress={abrir} carregando={salvando} desabilitado={!podeAbrir} />

          {data !== '' && iso === null && (
            <Text style={estilos.dica}>Data inválida. Use dd/mm/aaaa.</Text>
          )}
          {!precosLidos && (
            <Text style={estilos.dica}>Não entendi o valor. Use algo como 600,00.</Text>
          )}
          {precosLidos && !temAlgumPreco && (
            <Text style={estilos.dica}>
              Informe pelo menos um dos dois valores — um dia sem preço não pode ser reservado.
            </Text>
          )}
        </View>

        <Erro mensagem={erro} />

        <Text style={estilos.secao}>Datas abertas</Text>
        {carregando ? (
          <Text style={estilos.vazio}>Carregando…</Text>
        ) : dias.length === 0 ? (
          <Text style={estilos.vazio}>Nenhuma data aberta ainda.</Text>
        ) : (
          dias.map((d) => (
            <View key={d.data} style={estilos.dia}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.diaData}>{paraBR(d.data)}</Text>
                <Text style={estilos.diaPreco}>
                  {d.preco_barco_centavos > 0 && `${formatarBRL(d.preco_barco_centavos)} o dia`}
                  {d.preco_barco_centavos > 0 && d.preco_passageiro_centavos > 0 && ' + '}
                  {d.preco_passageiro_centavos > 0 &&
                    `${formatarBRL(d.preco_passageiro_centavos)} por pescador`}
                </Text>
                {d.observacao ? <Text style={estilos.diaObs}>{d.observacao}</Text> : null}
              </View>
              <Pressable onPress={() => fechar(d)}>
                <Text style={estilos.fechar}>Fechar</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable onPress={() => router.replace('/barcos')} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>Voltar aos barcos</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
  formulario: { marginBottom: 8 },
  previa: {
    backgroundColor: cores.aguaClara,
    color: cores.agua,
    fontWeight: '600',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    textAlign: 'center',
  },
  dica: { color: cores.suave, fontSize: 13, marginTop: 10, textAlign: 'center' },
  secao: { fontSize: 15, fontWeight: '700', color: cores.texto, marginTop: 24, marginBottom: 10 },
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  diaData: { fontSize: 16, fontWeight: '700', color: cores.texto },
  diaPreco: { fontSize: 13, color: cores.suave, marginTop: 2 },
  diaObs: { fontSize: 12, color: cores.suave, marginTop: 4, fontStyle: 'italic' },
  fechar: { color: cores.erro, fontWeight: '600' },
  vazio: { color: cores.suave, textAlign: 'center' },
  voltar: { marginTop: 28, alignItems: 'center' },
  voltarTexto: { color: cores.agua, fontWeight: '600' },
});
