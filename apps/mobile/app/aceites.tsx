/**
 * Aceite de documento que ganhou versão nova.
 *
 * Aparece para quem já tem cadastro quando um texto é republicado. Sem esta
 * tela, publicar uma versão nova seria publicar para ninguém: quem tem perfil
 * vai direto para o início, e a versão que passa a valer não teria sido aceita
 * por ninguém — a cláusula nova não valeria contra quem já estava dentro.
 *
 * Só os documentos PENDENTES aparecem. Repetir os que já foram aceitos faria a
 * pessoa reassinar o que não mudou, e o registro perderia o sentido de marcar
 * exatamente qual texto foi aceito e quando.
 *
 * As caixas nascem desmarcadas, como no cadastro: aceite pré-marcado não é
 * manifestação de vontade, é vício que derruba a cláusula.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { mensagemDeErro } from '@/lib/erros';
import { registrarAceites, type DocumentoSlug } from '@/lib/legal';
import { Botao, CaixaAceite, Erro, Subtitulo, Titulo } from '@/ui/componentes';
import { useTema, type Cores } from '@/ui/tema';

export default function Aceites() {
  const { cores } = useTema();
  const estilos = useMemo(() => criarEstilos(cores), [cores]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessao, perfil, aceitesPendentes, recarregarPerfil, sair } = useAuth();

  const [marcados, setMarcados] = useState<DocumentoSlug[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const userId = sessao?.user.id ?? null;
  const faltam = aceitesPendentes.filter((d) => !marcados.includes(d.slug));

  async function confirmar() {
    if (!userId) return;
    setErro(null);
    setEnviando(true);
    try {
      await registrarAceites(userId, aceitesPendentes, marcados);
      // Recarrega para o porteiro reavaliar: sem isto a tela continuaria de pé
      // com tudo já aceito.
      await recarregarPerfil();
      router.replace('/');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível registrar seu aceite.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Titulo>
        {aceitesPendentes.length === 1 ? 'Um documento mudou' : 'Alguns documentos mudaram'}
      </Titulo>
      <Subtitulo>
        {perfil?.nome.split(' ')[0]}, publicamos uma versão nova
        {aceitesPendentes.length === 1 ? ' de um documento' : ' de alguns documentos'} que rege
        o seu uso da plataforma. Leia e confirme para continuar. Suas reservas já fechadas
        continuam valendo pela versão que você aceitou na época.
      </Subtitulo>

      {aceitesPendentes.map((d) => (
        <CaixaAceite
          key={d.slug}
          marcada={marcados.includes(d.slug)}
          onToggle={() =>
            setMarcados((m) =>
              m.includes(d.slug) ? m.filter((s) => s !== d.slug) : [...m, d.slug],
            )
          }
        >
          <Text style={estilos.texto}>
            Li e aceito{' '}
            <Text
              style={estilos.link}
              onPress={() =>
                router.push({ pathname: '/documento', params: { slug: d.slug, versao: d.versao } })
              }
            >
              {d.titulo}
            </Text>{' '}
            <Text style={estilos.versao}>(versão {d.versao})</Text>
          </Text>
        </CaixaAceite>
      ))}

      <Botao
        titulo="Confirmar e continuar"
        onPress={confirmar}
        carregando={enviando}
        desabilitado={faltam.length > 0}
      />

      {faltam.length > 0 && (
        <Text style={estilos.dica}>
          Falta marcar: {faltam.map((d) => d.titulo).join(', ')}.
        </Text>
      )}

      <Erro mensagem={erro} />

      {/* Quem não concorda precisa de uma saída que não seja fechar o aplicativo
          e voltar ao mesmo lugar amanhã. */}
      <Pressable onPress={sair} style={estilos.sair}>
        <Text style={estilos.sairTexto}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

const criarEstilos = (cores: Cores) =>
  StyleSheet.create({
    conteudo: { paddingHorizontal: 24, paddingBottom: 64 },
    texto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
    link: { color: cores.acento, fontWeight: '700', textDecorationLine: 'underline' },
    versao: { color: cores.textoSuave, fontSize: 12 },
    dica: { color: cores.textoSuave, fontSize: 13, marginTop: 12, lineHeight: 18 },
    sair: { marginTop: 30, alignItems: 'center' },
    sairTexto: { color: cores.textoSuave, fontWeight: '600' },
  });
