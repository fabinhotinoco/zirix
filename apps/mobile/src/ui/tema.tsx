/**
 * Tema do aplicativo: dia, noite ou híbrido.
 *
 * A paleta é uma só — Abissal, a identidade da marca, fixa no núcleo. O que se
 * escolhe aqui é o modo de exibição, que é preferência de quem usa. Deixar a
 * cor da marca escolhível seria abrir mão da própria identidade.
 *
 * A escolha fica no aparelho, não no banco: muda a cada troca de celular e não
 * vale a viagem de rede. Guardar no banco também significaria a tela nascer com
 * a cor errada e piscar quando a resposta chegasse.
 *
 * O provedor entrega `cores` já resolvidas. Nenhuma tela precisa saber se está
 * de dia ou de noite — ela pede a cor do texto e recebe a certa.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MARCA,
  coresDe,
  resolverAparencia,
  type Aparencia,
  type Cores,
  type ModoDeTema,
} from '@pescavertical/core/tema';

export { MARCA, coresDe };
export type { Cores, ModoDeTema };

const CHAVE_MODO = 'pv.tema.modo';

interface Contexto {
  modo: ModoDeTema;
  aparencia: Aparencia;
  cores: Cores;
  definirModo: (m: ModoDeTema) => void;
  /** Falso até a preferência guardada ser lida — evita piscar a cor errada. */
  pronto: boolean;
}

const TemaContexto = createContext<Contexto | null>(null);

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const doSistema: Aparencia = useColorScheme() === 'dark' ? 'noite' : 'dia';

  const [modo, setModo] = useState<ModoDeTema>('hibrido');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const m = await AsyncStorage.getItem(CHAVE_MODO);
        if (!vivo) return;
        // Valor guardado por uma versão antiga não pode deixar o aplicativo sem
        // cor: só os três conhecidos passam, o resto cai no padrão.
        if (m === 'dia' || m === 'noite' || m === 'hibrido') setModo(m);
      } catch {
        // Sem preferência guardada, vale o padrão. Não é motivo de erro.
      } finally {
        if (vivo) setPronto(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const definirModo = useCallback((m: ModoDeTema) => {
    setModo(m);
    void AsyncStorage.setItem(CHAVE_MODO, m).catch(() => {});
  }, []);

  const valor = useMemo<Contexto>(() => {
    const aparencia = resolverAparencia(modo, doSistema);
    return { modo, aparencia, cores: coresDe(aparencia), definirModo, pronto };
  }, [modo, doSistema, definirModo, pronto]);

  return <TemaContexto.Provider value={valor}>{children}</TemaContexto.Provider>;
}

export function useTema(): Contexto {
  const ctx = useContext(TemaContexto);
  if (!ctx) throw new Error('useTema precisa estar dentro de <TemaProvider>.');
  return ctx;
}
