/**
 * Tema do aplicativo: modo (dia, noite, híbrido) e paleta.
 *
 * A escolha fica no aparelho, não no banco: é preferência de aparência, muda a
 * cada troca de celular e não vale a viagem de rede. Guardar no banco também
 * significaria a tela nascer com a cor errada e piscar quando a resposta
 * chegasse.
 *
 * O provedor entrega `cores` já resolvidas. Nenhuma tela precisa saber se está
 * de dia ou de noite — ela pede a cor do texto e recebe a certa.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PALETAS,
  coresDe,
  paletaPorNome,
  resolverAparencia,
  type Aparencia,
  type Cores,
  type ModoDeTema,
  type NomeDePaleta,
  type Paleta,
} from '@pescavertical/core/tema';

export { PALETAS, coresDe };
export type { Cores, ModoDeTema, NomeDePaleta, Paleta };

const CHAVE_MODO = 'pv.tema.modo';
const CHAVE_PALETA = 'pv.tema.paleta';

interface Contexto {
  modo: ModoDeTema;
  paleta: Paleta;
  aparencia: Aparencia;
  cores: Cores;
  definirModo: (m: ModoDeTema) => void;
  definirPaleta: (p: NomeDePaleta) => void;
  /** Falso até a preferência guardada ser lida — evita piscar a cor errada. */
  pronto: boolean;
}

const TemaContexto = createContext<Contexto | null>(null);

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const doSistema: Aparencia = useColorScheme() === 'dark' ? 'noite' : 'dia';

  const [modo, setModo] = useState<ModoDeTema>('hibrido');
  const [nomeDaPaleta, setNomeDaPaleta] = useState<NomeDePaleta>('abissal');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [m, p] = await Promise.all([
          AsyncStorage.getItem(CHAVE_MODO),
          AsyncStorage.getItem(CHAVE_PALETA),
        ]);
        if (!vivo) return;
        // Valor guardado por uma versão antiga não pode deixar o aplicativo sem
        // cor: a checagem aqui e o `paletaPorNome` abaixo cobrem os dois lados.
        if (m === 'dia' || m === 'noite' || m === 'hibrido') setModo(m);
        if (p) setNomeDaPaleta(paletaPorNome(p).nome);
      } catch {
        // Sem preferência guardada, valem os padrões. Não é motivo de erro.
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

  const definirPaleta = useCallback((p: NomeDePaleta) => {
    setNomeDaPaleta(p);
    void AsyncStorage.setItem(CHAVE_PALETA, p).catch(() => {});
  }, []);

  const valor = useMemo<Contexto>(() => {
    const paleta = paletaPorNome(nomeDaPaleta);
    const aparencia = resolverAparencia(modo, doSistema);
    return {
      modo,
      paleta,
      aparencia,
      cores: coresDe(paleta, aparencia),
      definirModo,
      definirPaleta,
      pronto,
    };
  }, [modo, nomeDaPaleta, doSistema, definirModo, definirPaleta, pronto]);

  return <TemaContexto.Provider value={valor}>{children}</TemaContexto.Provider>;
}

export function useTema(): Contexto {
  const ctx = useContext(TemaContexto);
  if (!ctx) throw new Error('useTema precisa estar dentro de <TemaProvider>.');
  return ctx;
}
