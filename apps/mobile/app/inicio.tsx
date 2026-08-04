/**
 * Início: o que a pessoa pode fazer, na ordem em que importa.
 *
 * Um só caminho vem pintado de acento — o principal daquele papel. Se todos
 * fossem, nenhum seria: acento em tudo é o mesmo que acento em nada, e a tela
 * vira um bloco de cor sem hierarquia. Os demais são superfície com traço fino.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { quantosNaoLidos } from '@/lib/avisos';
import { Simbolo } from '@/ui/logo';
import { Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Inicio() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { perfil, sair } = useAuth();
  const [naoLidos, setNaoLidos] = useState(0);

  // Ao voltar da caixa de avisos o selo tem de estar em dia. Um useEffect só na
  // montagem deixaria "3 novos" na tela depois de a pessoa ter lido os três.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      // Selo é enfeite: se a contagem falhar, a tela continua funcionando.
      quantosNaoLidos()
        .then((n) => vivo && setNaoLidos(n))
        .catch(() => {});
      return () => {
        vivo = false;
      };
    }, []),
  );

  const guia = perfil?.role === 'guia';
  const master = perfil?.role === 'master';

  function Acao({
    para,
    titulo,
    nota,
    principal,
    selo,
  }: {
    para: string;
    titulo: string;
    nota: string;
    principal?: boolean;
    selo?: number;
  }) {
    return (
      <Pressable
        onPress={() => router.push(para)}
        accessibilityRole="button"
        style={[estilos.acao, principal && estilos.acaoPrincipal]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[estilos.acaoTexto, principal && estilos.acaoTextoPrincipal]}>{titulo}</Text>
          <Text style={[estilos.acaoNota, principal && estilos.acaoNotaPrincipal]}>{nota}</Text>
        </View>
        {selo ? (
          <Text style={estilos.selo} accessibilityLabel={`${selo} avisos não lidos`}>
            {selo}
          </Text>
        ) : (
          <Text style={[estilos.seta, principal && estilos.setaPrincipal]}>›</Text>
        )}
      </Pressable>
    );
  }

  return (
    <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 28 }]}>
      <View style={estilos.topo}>
        <Simbolo tamanho={30} />
        <Text style={estilos.papel}>
          {guia ? 'Guia de pesca' : master ? 'Administrador' : 'Pescador'}
        </Text>
      </View>

      <Titulo>Olá, {perfil?.nome.split(' ')[0]}</Titulo>
      <Subtitulo>
        {guia
          ? 'Sua agenda, sua frota e o que está por receber.'
          : master
            ? 'Aprovações, comissões e o movimento da plataforma.'
            : 'Escolha um guia, veja as datas livres e feche a pescaria.'}
      </Subtitulo>

      {/* O caminho principal muda com o papel: o pescador vem procurar
          pescaria, o guia vem ver o dia dele, o master vem aprovar. */}
      {guia ? (
        <Acao
          para="/calendario"
          titulo="Minha agenda"
          nota="Mês, semana ou dia — com quitado e em aberto"
          principal
        />
      ) : master ? (
        <Acao
          para="/calendario"
          titulo="Agenda da plataforma"
          nota="Todas as operações, num calendário só"
          principal
        />
      ) : (
        <Acao
          para="/buscar"
          titulo="Procurar pescaria"
          nota="Guias, barcos e datas livres"
          principal
        />
      )}

      <Acao
        para="/avisos"
        titulo="Avisos"
        nota="Reservas, pagamentos e valores em aberto"
        selo={naoLidos > 0 ? naoLidos : undefined}
      />

      {!guia && !master && (
        <Acao para="/reservas" titulo="Minhas reservas" nota="Datas, acompanhantes e valores" />
      )}
      {master && (
        <Acao
          para="/guias"
          titulo="Guias da plataforma"
          nota="Aprovar inscrições e definir comissões"
        />
      )}
      {(guia || master) && (
        <Acao para="/buscar" titulo="Procurar pescaria" nota="Ver a plataforma como um cliente vê" />
      )}

      {guia && (
        <>
          <Acao para="/barcos" titulo="Meus barcos" nota="Frota, agenda e preços de cada dia" />
          <Acao para="/guia" titulo="Minha operação" nota="Situação da inscrição e dados" />
        </>
      )}

      <Acao
        para="/aparencia"
        titulo="Aparência"
        nota="Modo dia, noite ou híbrido"
      />

      <Pressable onPress={sair} style={estilos.sair}>
        <Text style={estilos.sairTexto}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 56 },
    topo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 22,
    },
    papel: {
      fontSize: 10,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    acao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 17,
    },
    acaoPrincipal: { backgroundColor: cores.acento, borderColor: cores.acento, marginTop: 4 },
    acaoTexto: { fontSize: 16, fontWeight: '700', color: cores.texto, letterSpacing: -0.2 },
    acaoTextoPrincipal: { color: cores.acentoTexto },
    acaoNota: { fontSize: 13, color: cores.textoSuave, marginTop: 3 },
    // Sobre o acento, o texto secundário precisa da mesma cor do principal com
    // opacidade — textoSuave foi medido contra o fundo da tela, não contra o
    // botão, e ali pode desaparecer.
    acaoNotaPrincipal: { color: cores.acentoTexto, opacity: 0.75 },
    seta: { fontSize: 24, color: cores.textoSuave, lineHeight: 26 },
    setaPrincipal: { color: cores.acentoTexto, opacity: 0.75 },
    selo: {
      backgroundColor: cores.acento,
      color: cores.acentoTexto,
      fontSize: 12,
      fontWeight: '700',
      minWidth: 24,
      textAlign: 'center',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    sair: { marginTop: 32, alignItems: 'center' },
    sairTexto: { color: cores.textoSuave, fontWeight: '600' },
  });
