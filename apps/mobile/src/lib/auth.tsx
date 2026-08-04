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

import { pendenciasDoPerfil } from './legal';
import { supabase } from './supabase';
import type { DocumentoVigente } from '@pescavertical/core/legal';

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
  /**
   * Documentos que ganharam versão nova depois do cadastro. Publicar um texto
   * novo sem isto seria publicar para ninguém: quem já tem perfil vai direto
   * para o início e nunca mais veria uma tela de aceite.
   */
  aceitesPendentes: DocumentoVigente[];
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  // Enquanto o perfil não foi buscado, "sem perfil" e "ainda não sei" são
  // estados diferentes. Confundir os dois joga quem já tem cadastro de volta
  // para a tela de cadastro.
  const [buscandoPerfil, setBuscandoPerfil] = useState(false);
  const [aceitesPendentes, setAceitesPendentes] = useState<DocumentoVigente[]>([]);

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

    // ATENÇÃO: este retorno de chamada precisa ser síncrono.
    //
    // O supabase-js segura um bloqueio enquanto entrega o evento. Chamar outra
    // função dele aqui dentro — como a busca do perfil, que também precisa da
    // sessão — pode travar uma esperando a outra. O sintoma é cruel: a entrada
    // dá certo, o servidor devolve a sessão, e a tela simplesmente não muda.
    //
    // Então aqui só guardamos a sessão. O perfil é buscado no efeito abaixo,
    // já fora do bloqueio.
    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, nova) => {
      if (!ativo) return;
      setSessao(nova);
    });

    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, []);

  // Depende do identificador, não do objeto: o Supabase entrega uma sessão nova
  // a cada renovação de token, e refazer a busca a cada renovação seria só
  // trabalho perdido.
  const userId = sessao?.user.id ?? null;

  useEffect(() => {
    let ativo = true;
    if (!userId) {
      setPerfil(null);
      setAceitesPendentes([]);
      setBuscandoPerfil(false);
      return;
    }
    setBuscandoPerfil(true);
    carregarPerfil(userId)
      .then(async (p) => {
        if (!ativo) return;
        setPerfil(p);
        if (!p) {
          setAceitesPendentes([]);
          return;
        }
        // Falhar aqui não pode trancar ninguém para fora. Este portão é de
        // consentimento, não de segurança: sem a resposta, o aplicativo segue e
        // pergunta de novo na próxima abertura. Trancar por falha de rede
        // trocaria um aceite atrasado por um aplicativo inutilizável.
        const pend = await pendenciasDoPerfil(userId, p.role).catch(() => []);
        if (ativo) setAceitesPendentes(pend);
      })
      .catch(() => {
        // Sem perfil o aplicativo manda para o cadastro, que é o destino certo
        // também quando a busca falha — melhor que uma tela em branco.
        if (ativo) setPerfil(null);
      })
      .finally(() => {
        if (ativo) setBuscandoPerfil(false);
      });
    return () => {
      ativo = false;
    };
  }, [userId]);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando: carregando || buscandoPerfil,
      sessao,
      perfil,
      aceitesPendentes,
      recarregarPerfil: async () => {
        if (!userId) return;
        const p = await carregarPerfil(userId);
        setPerfil(p);
        setAceitesPendentes(p ? await pendenciasDoPerfil(userId, p.role).catch(() => []) : []);
      },
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [carregando, buscandoPerfil, sessao, perfil, aceitesPendentes, userId],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
