# Deixar o banco pronto — 2 minutos, só pelo navegador

Sem terminal, sem instalar nada, sem me passar chave nenhuma.

---

## Passo 1 — Abrir o SQL Editor

No painel do seu projeto Supabase, menu da esquerda → **SQL Editor** → **New query**.

## Passo 2 — Colar e rodar

Abra o arquivo **[`setup-completo.sql`](./setup-completo.sql)** aqui no GitHub, clique no botão de
copiar (ícone no canto do bloco de código), cole no editor e clique em **Run**.

São ~1.500 linhas. Vai levar alguns segundos.

## Passo 3 — Conferir

No fim, o próprio SQL devolve uma tabelinha. Deve sair exatamente assim:

| tabelas | politicas | configuracoes | faixas_cancelamento | documentos_legais |
|---|---|---|---|---|
| 19 | 35 | 14 | 5 | 5 |

Se bater, o banco está pronto: tabelas, regras de segurança, valores padrão da plataforma, a escala de
cancelamento e os cinco documentos legais já carregados.

**Se der erro**, copie a mensagem e me mande. O arquivo foi testado num Postgres limpo antes de chegar
até você, então erro aqui provavelmente é diferença de configuração do projeto — resolvo rápido.

---

## Passo 4 — Me mandar duas coisas

No painel: **Project Settings → API**.

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- **anon public** — a chave longa marcada como *anon* / *public*

Pode mandar as duas por aqui sem receio: **a chave `anon` é pública por natureza**, ela vai dentro do
aplicativo que qualquer pessoa baixa da loja. Quem protege os dados é o RLS que acabou de ser
aplicado, não o segredo da chave — e é exatamente isso que os 14 testes de segurança verificam.

⚠️ **A chave `service_role` é o oposto:** ela ignora todas as regras de segurança. **Nunca** me mande
essa, nem cole em lugar nenhum. Ela só vai ser usada dentro das Edge Functions, configurada por você
direto no painel do Supabase.

---

## Passo 5 — Ligar o login por telefone (pode ficar para depois)

O aplicativo entra por código SMS. Para isso funcionar de verdade, o Supabase precisa de um provedor
de SMS: **Authentication → Providers → Phone**, ativar, e preencher com Twilio ou Zenvia.

Dá para deixar isso para quando você tiver a conta do provedor — enquanto isso, o desenvolvimento
segue com login por e-mail.

---

## Quando algo mudar no banco

Não edite `setup-completo.sql` à mão: ele é gerado. Altere `supabase/migrations/`, `supabase/seed.sql`
ou `docs/legal/`, e rode:

```bash
node tools/build-setup-sql.mjs
```

Para conferir tudo num Postgres descartável antes de aplicar no Supabase:

```bash
./supabase/tests/run.sh
```
