#!/usr/bin/env bash
# Sobe um Postgres descartável, aplica a migração e roda os testes de RLS.
# Não depende de Supabase nem de internet.
#
#   ./supabase/tests/run.sh
#
# Serve tanto para conferir uma alteração de schema antes de subir quanto
# para rodar em CI.

set -euo pipefail

PORT="${PGTEST_PORT:-55432}"
DATA="${PGTEST_DATA:-/var/tmp/pgzirix}"
DB="${PGTEST_DB:-zirix}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PATH="$PATH:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin"

if ! command -v initdb >/dev/null; then
  echo "✗ PostgreSQL não encontrado. Instale o pacote postgresql." >&2
  exit 1
fi

# initdb e postgres se recusam a rodar como root; quando for o caso,
# delegamos ao usuário postgres do sistema.
como_pg() {
  if [ "$(id -un)" = "root" ]; then
    su postgres -c "PATH=$PATH $*"
  else
    eval "$*"
  fi
}

if [ ! -f "$DATA/PG_VERSION" ]; then
  echo "→ criando cluster em $DATA"
  rm -rf "$DATA"; mkdir -p "$DATA"
  [ "$(id -un)" = "root" ] && chown postgres:postgres "$DATA" && chmod 700 "$DATA"
  como_pg "initdb -D $DATA -U postgres --auth=trust" >/dev/null
fi

if ! pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1; then
  echo "→ subindo Postgres na porta $PORT"
  como_pg "pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log start" >/dev/null
  sleep 2
fi

echo "→ recriando o banco $DB"
psql -h /tmp -p "$PORT" -U postgres -q \
  -c "drop database if exists $DB;" -c "create database $DB;" 2>/dev/null

aplicar() {
  echo "→ $(basename "$1")"
  psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1"
}

aplicar "$RAIZ/supabase/tests/00_shim_auth.sql"
for m in "$RAIZ"/supabase/migrations/*.sql; do aplicar "$m"; done
aplicar "$RAIZ/supabase/seed.sql"

# Reaplicar tudo por cima, que é o que o robô 5 faz num banco que já está de pé.
# Sem este passo, o CI só testa banco vazio — e uma migração que muda o tipo de
# retorno de uma função criada por outra anterior passa aqui e trava lá. Já
# aconteceu: `datas_disponiveis` ganhou a hora de saída e o robô 5 parou com
# "cannot change return type of existing function".
echo "→ reaplicando atualizacoes.sql (o que o robô 5 faz num banco existente)"
aplicar "$RAIZ/supabase/atualizacoes.sql"

echo
psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
     -f "$RAIZ/supabase/tests/01_rls_test.sql" 2>&1 \
  | grep -E "NOTICE|ERROR" \
  | sed 's/^psql:[^:]*:[0-9]*: //; s/^NOTICE:  //'

echo
echo "Para inspecionar:  psql -h /tmp -p $PORT -U postgres -d $DB"
