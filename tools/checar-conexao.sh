#!/usr/bin/env bash
# Confere o endereço de conexão do banco antes de usá-lo, e traduz o erro.
#
#   SUPABASE_DB_URL=... tools/checar-conexao.sh
#
# Existe porque as mensagens do psql e do Supabase, sozinhas, apontam para a
# causa errada com frequência — e cada diagnóstico errado custa uma troca de
# senha à toa. Cada verificação aqui corresponde a um erro que já aconteceu de
# verdade neste projeto.
#
# Nunca imprime a senha: só o trecho do endereço depois do @.

set -uo pipefail

URL="${SUPABASE_DB_URL:-}"

erro() {
  echo "::error::$1"
  shift
  for linha in "$@"; do echo "$linha"; done
  exit 1
}

if [ -z "$URL" ]; then
  erro "Falta o segredo SUPABASE_DB_URL." \
    "" \
    "Guarde-o em:" \
    "  https://github.com/fabinhotinoco/zirix/settings/secrets/actions" \
    "" \
    "O passo a passo está em docs/SEM-TERMINAL.md, preparação 1."
fi

# Sem o prefixo, o psql entende o texto como nome de um banco local e tenta
# conectar na própria máquina — erro que não indica a causa.
case "$URL" in
  postgresql://*|postgres://*) ;;
  *)
    erro "O segredo SUPABASE_DB_URL não começa com postgresql://" \
      "" \
      "Ele precisa ser o endereço completo, no formato:" \
      "  postgresql://postgres.SEUPROJETO:SENHA@aws-0-...pooler.supabase.com:5432/postgres" \
      "" \
      "No Supabase: Project Settings -> Database -> Connection string -> Session pooler." \
      "Copie a linha inteira, não apenas a senha."
    ;;
esac

# Erro mais comum: copiar a linha do painel e esquecer de trocar o marcador.
case "$URL" in
  *YOUR-PASSWORD*|*'[senha]'*|*'[SENHA]'*|*'[password]'*)
    erro "O endereço ainda tem o marcador [YOUR-PASSWORD] no lugar da senha." \
      "" \
      "Troque [YOUR-PASSWORD] — inclusive os colchetes — pela senha real." \
      "Se não souber qual é, gere outra em" \
      "Project Settings -> Database -> Reset database password."
    ;;
esac

# O trecho depois do @ não é secreto: serve para conferir o projeto e o modo.
echo "Vai conectar em: ${URL##*@}"

SEM_ESQUEMA="${URL#*://}"
USUARIO="${SEM_ESQUEMA%%:*}"
echo "Usuário: ${USUARIO}"

case "$URL" in
  *pooler.supabase.com*) echo "Endereço do pooler: correto." ;;
  *) echo "::warning::Este não parece o endereço do pooler. Se falhar, use a aba Session pooler." ;;
esac

# 6543 é o pooler em modo transação, para muitas conexões curtas de aplicativo.
# Criar tabelas e funções pede modo sessão, na 5432 — mesmo endereço, outra porta.
case "$URL" in
  *:6543/*)
    erro "A porta 6543 é o pooler em modo transação." \
      "" \
      "Para este uso é preciso o modo sessão, na porta 5432." \
      "O endereço é o mesmo: troque apenas 6543 por 5432 no segredo." \
      "" \
      "  ...pooler.supabase.com:5432/postgres" \
      "                         ^^^^"
    ;;
esac

if psql "$URL" -tAc "select 1" > /dev/null 2> /tmp/erro-conexao; then
  echo "Conexão bem-sucedida."
  exit 0
fi

echo "::error::Não consegui conectar no banco."
echo ""
sed 's/^/  /' /tmp/erro-conexao
echo ""

# A conexão direta do Supabase (db.SEUPROJETO.supabase.co) só responde em IPv6,
# e os servidores do GitHub não têm IPv6. É a causa mais comum, e o erro não
# deixa isso óbvio.
if grep -q "Network is unreachable" /tmp/erro-conexao; then
  echo "CAUSA: você copiou a conexão DIRETA, que só funciona em IPv6."
  echo "Os servidores do GitHub não têm IPv6, então nunca alcançam esse endereço."
  echo ""
  echo "SOLUÇÃO: use o endereço do POOLER, que funciona em IPv4."
  echo "No Supabase: Project Settings -> Database -> Connection string -> Session pooler."
  echo ""
  echo "  postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

elif grep -qi "password authentication failed" /tmp/erro-conexao; then
  echo "CAUSA: a senha dentro do endereço está errada."
  echo ""
  # O pooler do Supabase sempre relata o usuário já sem o código do projeto.
  # Por isso a mensagem fala em usuário \"postgres\" mesmo quando o segredo tem
  # \"postgres.SEUPROJETO\" corretamente — não adianta mexer no usuário.
  echo "A mensagem acima fala do usuário \"postgres\" mesmo que o seu segredo"
  echo "tenha \"postgres.SEUPROJETO\": o pooler corta o código do projeto antes"
  echo "de relatar. Ou seja, isto é senha, não usuário."
  echo ""
  echo "O que costuma ser:"
  echo "  1. A senha foi trocada depois que você copiou a linha."
  echo "     Copie a linha de novo, já com a senha atual."
  echo "  2. A senha tem / * @ # ? ou outro caractere especial, que quebra o"
  echo "     endereço. Gere outra só com letras e números em"
  echo "     Project Settings -> Database -> Reset database password."
  echo "  3. Sobrou um espaço ou uma quebra de linha ao colar no segredo."

else
  echo "Confira o endereço e a senha no segredo SUPABASE_DB_URL."
fi

exit 1
