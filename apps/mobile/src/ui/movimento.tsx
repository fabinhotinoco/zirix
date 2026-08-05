/**
 * O movimento do aplicativo.
 *
 * POR QUE DESENHADO EM CÓDIGO, E NÃO UM GIF OU UM VÍDEO EM LOOP.
 *
 * A ideia de pôr um arquivo animado em cada tela esbarra em quatro coisas:
 *
 * 1. **Peso.** Um loop curto em MP4 decente passa de 1 MB; em GIF, muito mais.
 *    Multiplicado por tela, é a primeira abertura do aplicativo ficando lenta
 *    justamente em celular ruim e internet de beira de cais.
 * 2. **Cor.** Arquivo tem fundo gravado. O aplicativo tem modo dia e modo
 *    noite, e um vídeo escuro no tema claro fica com um retângulo preto no meio
 *    da tela.
 * 3. **Bateria.** Vídeo em loop mantém o decodificador acordado. Numa tela que
 *    o pescador deixa aberta no barco, isso se paga em autonomia.
 * 4. **Não responde a nada.** Uma onda desenhada pode ficar mais agitada quando
 *    o mar está grosso. Um arquivo é sempre o mesmo.
 *
 * Desenhado em código pesa alguns kilobytes de JavaScript, segue a paleta
 * sozinho, roda na GPU e funciona sem internet.
 *
 * TUDO AQUI USA `useNativeDriver`. Só `transform` e `opacity` são animados —
 * são as duas propriedades que a thread de UI resolve sem acordar o JavaScript.
 * Animar largura ou cor obrigaria a passar por JS a cada quadro, e é assim que
 * animação bonita vira travamento em aparelho antigo.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTema, type Cores } from './tema';

// -----------------------------------------------------------------------------
// Onda: a assinatura visual, presente em todas as telas
// -----------------------------------------------------------------------------

/** Uma onda senoidal desenhada como caminho SVG, larga o bastante para repetir. */
function caminhoDeOnda(largura: number, altura: number, ciclos: number): string {
  const passos = ciclos * 16;
  const pontos: string[] = [`M 0 ${altura}`];
  for (let i = 0; i <= passos; i += 1) {
    const x = (i / passos) * largura;
    const y = altura / 2 - (altura / 2) * Math.sin((i / passos) * ciclos * 2 * Math.PI);
    pontos.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  pontos.push(`L ${largura} ${altura} Z`);
  return pontos.join(' ');
}

export interface OndasProps {
  altura?: number;
  /**
   * De 0 a 1: quanto o mar está mexido.
   *
   * Não é enfeite — na tela de condições ela recebe a altura real da ondulação,
   * e a água na tela fica agitada quando a água lá fora está. É o tipo de coisa
   * que um arquivo de vídeo nunca faria.
   */
  agitacao?: number;
  estilo?: ViewStyle;
}

/**
 * Faixa de água em movimento.
 *
 * Duas ondas deslizando em velocidades diferentes dão a sensação de
 * profundidade — é o mesmo truque de paralaxe que o olho lê como "água", e
 * custa dois `translateX`.
 */
export function Ondas({ altura = 56, agitacao = 0.35, estilo }: OndasProps) {
  const { cores } = useTema();
  const largura = 900;

  const frente = useRef(new Animated.Value(0)).current;
  const fundo = useRef(new Animated.Value(0)).current;

  const forca = Math.max(0, Math.min(1, agitacao));
  // Mar mexido anda mais rápido e desenha onda mais alta.
  const duracaoFrente = 9000 - forca * 4000;
  const duracaoFundo = 15000 - forca * 5000;

  useEffect(() => {
    const laco = (valor: Animated.Value, duracao: number) =>
      Animated.loop(
        Animated.timing(valor, {
          toValue: 1,
          duration: duracao,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
    const a = laco(frente, duracaoFrente);
    const b = laco(fundo, duracaoFundo);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [frente, fundo, duracaoFrente, duracaoFundo]);

  // Metade da largura: o desenho tem dois ciclos idênticos, então deslocar
  // metade e voltar ao começo não deixa emenda visível.
  const desliza = (v: Animated.Value) => ({
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -largura / 2] }) }],
  });

  const alturaOnda = altura * (0.5 + forca * 0.5);
  const caminho = useMemo(() => caminhoDeOnda(largura, alturaOnda, 2), [alturaOnda]);

  return (
    <View
      style={[{ height: altura, overflow: 'hidden' }, estilo]}
      // Decoração pura: leitor de tela não deve anunciar isso.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, desliza(fundo)]}>
        <Svg width={largura} height={altura} viewBox={`0 0 ${largura} ${alturaOnda}`}>
          <Path d={caminho} fill={cores.acento} opacity={0.12} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, desliza(frente)]}>
        <Svg width={largura} height={altura} viewBox={`0 0 ${largura} ${alturaOnda}`}>
          <Path d={caminho} fill={cores.acento} opacity={0.22} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Entrada de conteúdo
// -----------------------------------------------------------------------------

/**
 * Faz o conteúdo surgir subindo.
 *
 * `atraso` escalona os blocos de uma tela, o que dá a leitura de cima para
 * baixo em vez de tudo aparecendo de uma vez. Passar de ~400 ms no total já
 * começa a parecer lentidão, não capricho.
 */
export function Surgir({
  children,
  atraso = 0,
  distancia = 14,
}: {
  children: React.ReactNode;
  atraso?: number;
  distancia?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: 1,
      duration: 380,
      delay: atraso,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [p, atraso]);

  return (
    <Animated.View
      style={{
        opacity: p,
        transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [distancia, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Respiração lenta: uma pulsação sutil para o que está vivo agora.
 *
 * Usada no cartão do índice. A escala vai só até 1,015 de propósito — o olho
 * percebe o movimento, mas nada "salta", que num painel de dados seria
 * irritante em vez de agradável.
 */
export function Respirar({ children, ativo = true }: { children: React.ReactNode; ativo?: boolean }) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ativo) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [p, ativo]);

  return (
    <Animated.View
      style={{ transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

// -----------------------------------------------------------------------------
// Números e barras que crescem
// -----------------------------------------------------------------------------

/**
 * Número que sobe de zero até o valor.
 *
 * Aqui NÃO dá para usar o driver nativo: o valor precisa virar texto, e texto
 * mora no JavaScript. Por isso é curto (900 ms) e usado só no número grande do
 * índice — a mesma técnica repetida em vinte campos custaria quadros.
 *
 * A primeira versão trocava o conteúdo por `setNativeProps`, que evita
 * re-renderizar. Não serve: `setNativeProps` não existe no React Native Web, e
 * a versão web é justamente por onde o aplicativo está sendo testado. Um
 * `useState` num componente deste tamanho custa pouco — são ~54 renderizações
 * de um `<Text>` isolado — e funciona nas três plataformas.
 */
export function NumeroVivo({
  valor,
  estilo,
  duracao = 900,
}: {
  valor: number;
  estilo?: React.ComponentProps<typeof Animated.Text>['style'];
  duracao?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const [mostrado, setMostrado] = useState(0);

  useEffect(() => {
    p.setValue(0);
    const ouvinte = p.addListener(({ value }) => setMostrado(Math.round(value * valor)));
    const a = Animated.timing(p, {
      toValue: 1,
      duration: duracao,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => {
      a.stop();
      p.removeListener(ouvinte);
      // Quem sai da tela no meio da contagem precisa ver o número final na
      // volta, não o ponto em que parou.
      setMostrado(valor);
    };
  }, [p, valor, duracao]);

  return (
    <Animated.Text style={estilo} selectable={false}>
      {mostrado}
    </Animated.Text>
  );
}

/** Barra que cresce até a largura final. */
export function BarraViva({
  fracao,
  cor,
  cores,
  atraso = 0,
}: {
  fracao: number;
  cor: string;
  cores: Cores;
  atraso?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: 1,
      duration: 650,
      delay: atraso,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [p, atraso, fracao]);

  return (
    <View
      style={{
        height: 6, borderRadius: 3, backgroundColor: cores.superficieAlta,
        marginTop: 6, overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: cor,
          width: `${Math.max(0, Math.min(100, fracao * 100))}%`,
          // Escala no eixo X com origem à esquerda: anima no driver nativo, ao
          // contrário de animar `width`, que passaria por JS a cada quadro.
          transform: [{ scaleX: p }, { translateX: 0 }],
          alignSelf: 'flex-start',
        }}
      />
    </View>
  );
}

/**
 * Coluna da linha do tempo, crescendo de baixo para cima.
 *
 * `scaleY` com origem no pé, que é o que `transformOrigin` faria — mas ele não
 * existe no React Native, então o deslocamento é feito à mão.
 */
export function ColunaViva({
  altura,
  cor,
  opacidade = 1,
  atraso = 0,
}: {
  altura: number;
  cor: string;
  opacidade?: number;
  atraso?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: 1,
      duration: 520,
      delay: atraso,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [p, atraso, altura]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: altura,
        borderRadius: 4,
        backgroundColor: cor,
        opacity: opacidade,
        transform: [
          { scaleY: p },
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [altura / 2, 0] }) },
        ],
      }}
    />
  );
}
