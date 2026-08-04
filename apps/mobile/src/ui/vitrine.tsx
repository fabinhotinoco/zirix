/**
 * Vitrine de parceiros: os quatro anúncios, no rodapé das telas.
 *
 * Vai embaixo de propósito. Anúncio acima do conteúdo empurra a pescaria — que
 * é o produto — para fora da primeira tela, e a pessoa que abriu o aplicativo
 * para ver a reserva dela passa a ter de rolar por publicidade primeiro.
 *
 * O bloco é rotulado como publicidade e traz o nome de quem vende. O art. 36 do
 * Código de Defesa do Consumidor exige que a publicidade seja identificável
 * como tal — anúncio disfarçado de recomendação da plataforma é o que cria
 * responsabilidade sobre a venda de terceiro.
 *
 * Sem anúncio configurado, o bloco não aparece: espaço vazio com moldura só
 * anuncia que falta alguma coisa.
 */

import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { dominioDe, linkDeParceiro } from '@pescavertical/core/links';
import { anunciosVisiveis, registrarClique, type Anuncio } from '@/lib/anuncios';
import { useTema, type Cores } from './tema';

export function Vitrine() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);

  useEffect(() => {
    let vivo = true;
    // Vitrine é acessório: se a busca falhar, o bloco some e a tela segue.
    anunciosVisiveis()
      .then((a) => vivo && setAnuncios(a.filter((x) => x.ativo)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (anuncios.length === 0) return null;

  async function abrir(a: Anuncio) {
    const url = linkDeParceiro(a.url);
    if (!url) return;
    // Conta primeiro, mas sem esperar: o clique é estatística, e travar a ida
    // para a loja por causa dela seria trocar a venda pelo número.
    void registrarClique(a.id).catch(() => {});
    await Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={estilos.bloco}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.etiqueta}>Publicidade</Text>
        <Text style={estilos.nota}>A compra é feita no site do parceiro</Text>
      </View>

      <View style={estilos.grade}>
        {anuncios.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => abrir(a)}
            accessibilityRole="link"
            accessibilityLabel={`${a.titulo}, ${a.parceiro}${
              a.codigo_desconto ? `, cupom ${a.codigo_desconto}` : ''
            }`}
            style={estilos.cartao}
          >
            <Text style={estilos.titulo} numberOfLines={2}>
              {a.titulo}
            </Text>
            {a.chamada ? (
              <Text style={estilos.chamada} numberOfLines={2}>
                {a.chamada}
              </Text>
            ) : null}

            {a.codigo_desconto ? (
              <Text style={estilos.cupom}>{a.codigo_desconto}</Text>
            ) : null}

            {/* Para onde o toque leva. Quem clica tem direito de saber antes. */}
            <Text style={estilos.parceiro} numberOfLines={1}>
              {dominioDe(a.url) ?? a.parceiro}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    bloco: { marginTop: 34 },
    cabecalho: { marginBottom: 10 },
    etiqueta: {
      fontSize: 10,
      fontWeight: '700',
      color: cores.textoSuave,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    nota: { fontSize: 12, color: cores.textoSuave, marginTop: 2 },
    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    cartao: {
      // Dois por linha: quatro cartões numa fileira só, num celular, viram
      // quatro tarjas ilegíveis.
      flexBasis: '47%',
      flexGrow: 1,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 13,
      gap: 4,
    },
    titulo: { fontSize: 14, fontWeight: '700', color: cores.texto, lineHeight: 18 },
    chamada: { fontSize: 12, color: cores.textoSuave, lineHeight: 16 },
    cupom: {
      alignSelf: 'flex-start',
      marginTop: 4,
      backgroundColor: cores.acentoSuave,
      color: cores.acento,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      overflow: 'hidden',
    },
    parceiro: { fontSize: 11, color: cores.textoSuave, marginTop: 2 },
  });
