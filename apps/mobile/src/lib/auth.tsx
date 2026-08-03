/**
 * Sessão do usuário e perfil.
 *
 * A sessão é do Supabase Auth; o perfil (nome, papel) vive na tabela
 * `profiles`. Os dois andam juntos, mas nem sempre existem juntos: logo
 * depois do primeiro login existe sessão sem perfil, e é esse estado que
 * leva o usuário para a tela de cadastro.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type Papel = 'master' | 'guia' | 'cliente';

export interface Perfil {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  role: Papel;
}

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  async function carregarPerfil(userId: string): Promise<Perfil | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, telefone, email, role')
      .eq('id', userId)
      .maybeSingle();

    // Sem perfil ainda é situação normal (primeiro login), não erro.
    if (error) throw new Error(`Não foi possível carregar seu perfil: ${error.message}`);
    return (data as Perfil | null) ?? null;
  }

  useEffect(() => {
    let ativo = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      let sessao = data.session;

      // getSession só lê o armazenamento local: o token continua parecendo
      // válido depois de a conta ser apagada ou revogada no servidor, e o
      // aplicativo segue como se estivesse logado. O erro só aparece bem
      // depois, na primeira escrita, como violação de chave estrangeira —
      // mensagem que não diz nada a quem está usando.
      //
      // getUser pergunta ao servidor. Se ele não reconhece mais a conta,
      // descartamos a sessão aqui e a pessoa volta para a tela de entrada.
      if (sessao) {
        const { error } = await supabase.auth.getUser();
        if (error) {
          // Encerramento local: pedir ao servidor para encerrar uma sessão que
          // ele já não reconhece falharia de novo.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          sessao = null;
        }
      }

      if (!ativo) return;
      setSessao(sessao);
      if (sessao) setPerfil(await carregarPerfil(sessao.user.id));
      setCarregando(false);
    })();

    const { data: inscricao } = supabase.auth.onAuthStateChange(async (_evento, nova) => {
      if (!ativo) return;
      setSessao(nova);
      setPerfil(nova ? await carregarPerfil(nova.user.id) : null);
    });

    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      sessao,
      perfil,
      recarregarPerfil: async () => {
        if (sessao) setPerfil(await carregarPerfil(sessao.user.id));
      },
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [carregando, sessao, perfil],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
