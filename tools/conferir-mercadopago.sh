#!/usr/bin/env bash
# Confere se as credenciais do Mercado Pago guardadas no GitHub funcionam.
#
#   MP_CLIENT_ID=... MP_CLIENT_SECRET=... tools/conferir-mercadopago.sh
#
# POR QUE ISSO EXISTE:
#
# Segredo guardado no GitHub não avisa quando está errado. Um `client_secret`
# copiado pela metade, ou copiado ANTES de renovar as credenciais de produção
# (renovar troca o segredo), fica lá parecendo certo — e o defeito só aparece no
# dia em que o primeiro guia tentar conectar a conta, com uma mensagem que fala
# em "credenciais inválidas" e não em "você guardou a versão antiga".
#
# Aqui a gente descobre isso apertando um botão, antes de existir dinheiro.
#
# NADA SECRETO É IMPRESSO. O repositório é público e o registro da execução
# também: só saem o `client_id` (que já viaja à vista no link de conectar), o
# número da conta e o apelido dela. O `client_secret` e o token são mascarados
# antes de qualquer coisa poder ecoá-los.

set -uo pipefail

ID="${MP_CLIENT_ID:-}"
SECRET="${MP_CLIENT_SECRET:-}"

erro() {
  echo "::error::$1"
  shift
  for linha in "$@"; do echo "$linha"; done
  exit 1
}

# Mascarar ANTES de usar. Se algo ecoar o segredo mais adiante — uma mensagem de
# erro da API que devolve o que recebeu, por exemplo — o GitHub troca por ***.
[ -n "$SECRET" ] && echo "::add-mask::$SECRET"

if [ -z "$ID" ] || [ -z "$SECRET" ]; then
  erro "Falta credencial do Mercado Pago." \
    "" \
    "MP_CLIENT_ID:     $([ -n "$ID" ] && echo 'definido' || echo 'FALTANDO')" \
    "MP_CLIENT_SECRET: $([ -n "$SECRET" ] && echo 'definido' || echo 'FALTANDO')" \
    "" \
    "Guarde os dois em:" \
    "https://github.com/fabinhotinoco/zirix/settings/secrets/actions" \
    "O passo a passo está na Preparação 5 de docs/SEM-TERMINAL.md."
fi

# Erro comum: colar com espaço ou quebra de linha no fim. O campo do GitHub
# aceita, e a API recusa sem dizer o motivo.
if [ "$ID" != "$(printf '%s' "$ID" | tr -d '[:space:]')" ]; then
  erro "O MP_CLIENT_ID tem espaço ou quebra de linha." \
    "Refaça o segredo colando sem espaços antes ou depois."
fi
if [ "$SECRET" != "$(printf '%s' "$SECRET" | tr -d '[:space:]')" ]; then
  erro "O MP_CLIENT_SECRET tem espaço ou quebra de linha." \
    "Refaça o segredo colando sem espaços antes ou depois."
fi

echo "→ client_id: $ID"
echo

# -----------------------------------------------------------------------------
# 1. As duas credenciais são um par válido?
#
# `client_credentials` é a troca mais simples que o Mercado Pago aceita: id +
# segredo devolvem um token da própria aplicação. Se isso funciona, o par está
# correto e vigente. Não toca em conta de guia nenhum e não move dinheiro.
# -----------------------------------------------------------------------------
echo "→ pedindo um token de aplicação ao Mercado Pago…"

RESPOSTA=$(curl -sS -w '\n%{http_code}' -X POST 'https://api.mercadopago.com/oauth/token' \
  -H 'Content-Type: application/json' \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"$ID\",\"client_secret\":\"$SECRET\"}" 2>&1)
CURL_SAIDA=$?

# Falha de rede não é credencial errada, e confundir as duas manda você trocar
# um segredo que estava certo. Já aconteceu no ambiente de desenvolvimento, onde
# um proxy devolve 403 antes de a requisição chegar ao Mercado Pago.
if [ "$CURL_SAIDA" -ne 0 ]; then
  erro "Não consegui falar com o Mercado Pago (falha de rede, não de credencial)." \
    "" \
    "Isto NÃO quer dizer que seu segredo está errado — a requisição nem chegou lá." \
    "Rode de novo daqui a alguns minutos."
fi

HTTP=$(printf '%s' "$RESPOSTA" | tail -n1)
CORPO=$(printf '%s' "$RESPOSTA" | sed '$d')
TOKEN=$(printf '%s' "$CORPO" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  RESPOSTA="$CORPO"
  echo "→ o Mercado Pago respondeu HTTP $HTTP"
  # A resposta pode conter o que enviamos. O segredo já está mascarado, mas
  # mesmo assim só mostramos a mensagem, nunca o corpo inteiro.
  MENSAGEM=$(printf '%s' "$RESPOSTA" | sed -n 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$MENSAGEM" ] || MENSAGEM=$(printf '%s' "$RESPOSTA" | sed -n 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  erro "O Mercado Pago recusou as credenciais." \
    "" \
    "Mensagem dele: ${MENSAGEM:-(sem mensagem)}" \
    "" \
    "As três causas prováveis, em ordem:" \
    "1. Você renovou as credenciais de produção DEPOIS de copiar. Renovar troca" \
    "   o client_secret — o antigo para de valer na hora. Copie de novo." \
    "2. Você guardou as credenciais de TESTE em vez das de PRODUÇÃO." \
    "3. O client_secret foi copiado pela metade." \
    "" \
    "Refaça em: Suas integrações → PescaVerticalAPP → Credenciais de produção."
fi

echo "::add-mask::$TOKEN"
echo "✓ credenciais válidas — o Mercado Pago devolveu um token"
echo

# -----------------------------------------------------------------------------
# 2. A que conta essa aplicação pertence?
#
# Confirma que a aplicação nasceu na conta certa. Aplicação criada na conta
# errada funciona igual, e a comissão cai no lugar errado — defeito que só
# apareceria no primeiro repasse.
# -----------------------------------------------------------------------------
echo "→ conferindo de quem é a conta…"

CONTA=$(curl -sS 'https://api.mercadopago.com/users/me' \
  -H "Authorization: Bearer $TOKEN" 2>&1)

extrair() { printf '%s' "$CONTA" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }
extrair_num() { printf '%s' "$CONTA" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p"; }

CONTA_ID=$(extrair_num id)
APELIDO=$(extrair nickname)
PAIS=$(extrair site_id)

# O e-mail e o nome do titular NÃO são impressos: registro de execução em
# repositório público é página aberta na internet.
if [ -z "$CONTA_ID" ]; then
  echo "::warning::Não consegui ler os dados da conta. As credenciais valem, então isto não impede seguir."
else
  echo "✓ conta ${CONTA_ID} · apelido ${APELIDO:-?} · país ${PAIS:-?}"
  [ "$PAIS" = "MLB" ] || echo "::warning::A conta não é do Brasil (site_id=${PAIS}). Confira se é a conta certa."
fi
echo

# -----------------------------------------------------------------------------
# 3. O link que o guia vai usar para conectar a conta dele.
#
# Nada aqui é secreto: é exatamente o endereço que vai aparecer no navegador do
# guia. Imprimir serve para você abrir e ver com os próprios olhos se o Mercado
# Pago aceita o endereço de retorno — se ele reclamar de `redirect_uri`, o
# cadastro na aplicação está diferente do que o aplicativo vai enviar, e é
# melhor descobrir agora do que com o guia na linha.
# -----------------------------------------------------------------------------
RETORNO="${MP_REDIRECT_URI:-https://ykdbdpdepkdtyxtcwwex.supabase.co/functions/v1/mp-oauth}"

echo "→ link de conexão do guia (abra num navegador para conferir o retorno):"
echo
echo "https://auth.mercadopago.com.br/authorization?client_id=${ID}&response_type=code&platform_id=mp&redirect_uri=${RETORNO}"
echo
echo "  Esperado: a tela do Mercado Pago pedindo autorização."
echo "  Se aparecer erro falando em redirect_uri, o endereço cadastrado na"
echo "  aplicação está diferente deste. Confira em Configurações da aplicação."
echo
echo "Tudo conferido."
