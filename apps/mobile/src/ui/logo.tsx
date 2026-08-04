/**
 * A marca: uma linha vertical descendo através da água, com o eco do sonar.
 *
 * A ideia é a própria pesca vertical — a isca cai a prumo, o sonar devolve o
 * eco. Três elementos e nada mais: a linha, a superfície da água, o ponto com
 * as ondas. Marca que precisa de detalhe some no ícone de 24 pixels; esta
 * continua legível porque é feita de traço, não de desenho.
 *
 * Sem texto embutido. A palavra vem ao lado, em `Marca`, para o símbolo poder
 * ser usado sozinho no ícone do aplicativo e no cabeçalho estreito.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTema } from './tema';

export function Simbolo({
  tamanho = 40,
  cor,
  corSuave,
}: {
  tamanho?: number;
  cor?: string;
  corSuave?: string;
}) {
  const { cores } = useTema();
  const traco = cor ?? cores.acento;
  const secundario = corSuave ?? cores.textoSuave;

  // Desenhado numa grade de 48. O viewBox escala tudo junto — inclusive a
  // espessura do traço — então os números abaixo são sempre os mesmos.
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 48 48">
      {/* A superfície da água, no terço de cima: assim a linha fica pendurada
          ABAIXO dela. Com a água no meio, o desenho lia como uma cruz. */}
      <Line
        x1={5}
        y1={11}
        x2={43}
        y2={11}
        stroke={secundario}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* A linha, a prumo, atravessando a superfície. */}
      <Line
        x1={24}
        y1={4}
        x2={24}
        y2={29}
        stroke={traco}
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      {/* A isca no fundo. */}
      <Circle cx={24} cy={32.5} r={3.5} fill={traco} />

      {/* O eco do sonar: dois arcos abrindo para baixo. Os raios são grandes de
          propósito — arco de meia-volta estouraria os 48 do quadro. */}
      <Path
        d="M16 38a12 12 0 0 0 16 0"
        stroke={traco}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
      <Path
        d="M10 42a26 26 0 0 0 28 0"
        stroke={traco}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.4}
      />
    </Svg>
  );
}

/** Símbolo + palavra, para cabeçalhos e a tela de entrada. */
export function Marca({ tamanho = 40 }: { tamanho?: number }) {
  const { cores } = useTema();
  return (
    <View style={estilos.marca}>
      <Simbolo tamanho={tamanho} />
      <View>
        <Text style={[estilos.pesca, { color: cores.texto, fontSize: tamanho * 0.44 }]}>
          PESCA
        </Text>
        <Text
          style={[
            estilos.vertical,
            { color: cores.acento, fontSize: tamanho * 0.44, letterSpacing: tamanho * 0.09 },
          ]}
        >
          VERTICAL
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  marca: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Peso alto e letra espaçada: é o que dá o ar técnico sem precisar de fonte
  // própria — fonte própria custa download e atrasa a primeira tela.
  pesca: { fontWeight: '300', letterSpacing: 4, lineHeight: undefined },
  vertical: { fontWeight: '800' },
});
