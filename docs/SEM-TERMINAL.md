# Tudo pelo navegador — sem instalar nada

Este guia é para quem não quer (ou não pode) usar o Terminal. Você faz tudo em
páginas de site, clicando. Dois robôs no GitHub fazem o trabalho pesado.

São **três preparações que você faz uma única vez** e depois só aperta botão.

---

## Preparação 1 — Guardar a senha do banco no GitHub

O robô precisa de permissão para criar as tabelas no seu Supabase.

### a) Pegar o endereço de conexão

1. Entre no <https://supabase.com/dashboard> e abra seu projeto
2. Na engrenagem **Project Settings** (canto inferior esquerdo) → **Database**
3. Procure a caixa **Connection string**
4. **Escolha a aba `Session pooler`** — não a `Direct connection`
5. Marque a opção de exibir a senha, se houver, e **copie o texto inteiro**

Vai ser parecido com isto:

```
postgresql://postgres.abcdefgh:SUA-SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

> **Por que o pooler e não a conexão direta?** O endereço direto
> (`db.SEUPROJETO.supabase.co`) só responde em IPv6, e os servidores do GitHub
> não têm IPv6 — a conexão falha com `Network is unreachable`, um erro que não
> dá nenhuma pista da causa. O endereço do pooler funciona em IPv4.
>
> Dá para reconhecer o certo por dois sinais: o endereço contém
> `pooler.supabase.com`, e o usuário é `postgres.SEUPROJETO` em vez de só
> `postgres`.

> Se aparecer `[YOUR-PASSWORD]` no lugar da senha, troque manualmente pela senha
> que você definiu quando criou o projeto. Se não lembrar, na mesma página há a
> opção **Reset database password** para gerar uma nova.

**Ao gerar a senha, prefira apenas letras e números.** Caracteres como `/`, `*`,
`@`, `#` e `?` têm significado especial dentro de um endereço de conexão e
quebram a autenticação — o erro que aparece é `password authentication failed`,
que não dá nenhuma pista da causa real.

⚠️ **Esse texto é secreto de verdade** — diferente das chaves publicáveis, ele
dá acesso total ao banco: ler, alterar e apagar tudo, ignorando qualquer regra
de segurança. O endereço `db.<projeto>.supabase.co` é acessível pela internet,
então quem tiver a senha entra de qualquer lugar do mundo.

**Ele vai em um lugar só: o campo de segredo do GitHub.** Não mande por
mensagem, e-mail ou chat — inclusive para mim. Se isso acontecer por engano,
**troque a senha imediatamente** em Project Settings → Database → Reset
database password, e refaça este passo com a nova.

### b) Guardar no GitHub

1. Abra <https://github.com/fabinhotinoco/zirix/settings/secrets/actions>
2. Botão verde **New repository secret**
3. Em **Name**, escreva exatamente: `SUPABASE_DB_URL`
4. Em **Secret**, cole o texto que você copiou
5. **Add secret**

Pronto. O GitHub guarda isso cifrado; nem eu nem ninguém consegue ler depois.

---

## Preparação 2 — Guardar o acesso da Expo no GitHub

O robô precisa de permissão para montar o aplicativo na sua conta Expo.

### a) Criar o token

1. Entre em <https://expo.dev/settings/access-tokens>
2. **Create token**, dê um nome qualquer (ex.: `github`)
3. **Copie o token** — ele só aparece uma vez

### b) Guardar no GitHub

1. Abra <https://github.com/fabinhotinoco/zirix/settings/secrets/actions>
2. **New repository secret**
3. Em **Name**: `EXPO_TOKEN`
4. Em **Secret**: cole o token
5. **Add secret**

---

## Preparação 3 — Ligar o login por e-mail no Supabase

1. No painel do Supabase: **Authentication** → **Providers** → **Email**
2. Deixe **Enable Email provider** ligado
3. Procure a opção de **confirmação por código** (*Email OTP*) e prefira-a ao
   link mágico — o aplicativo espera um código de 6 dígitos
4. Salve

---

# Usando: aperte o botão

Todos os robôs ficam em <https://github.com/fabinhotinoco/zirix/actions>.

## Robô 1 — Preparar o banco (rode uma vez só)

1. Abra a aba **Actions**
2. Na lista da esquerda, clique em **1. Preparar o banco no Supabase**
3. Botão **Run workflow** (direita)
4. Em **Use workflow from**, escolha a branch
   `claude/pesca-vertical-booking-app-gbclox`
5. No campo de confirmação, digite `APLICAR`
6. **Run workflow**

Espere aparecer o ✓ verde (menos de um minuto). Clique nele para ver o resultado
no fim do registro. Deve mostrar:

```
tabelas | regras_de_seguranca | configuracoes | faixas_cancelamento | documentos_legais
     19 |                  35 |            14 |                   5 |                 5
```

> Ele se recusa a rodar duas vezes de propósito: se o banco já tiver as tabelas,
> para com uma mensagem explicando, em vez de bagunçar o que já existe.

## Robô 2 — Gerar o aplicativo para testar

1. Aba **Actions** → **2. Gerar o aplicativo para testar**
2. **Run workflow**
3. Escolha a mesma branch
4. Em **Para qual celular**, escolha `android` (mais simples e rápido)
5. **Run workflow**

Demora entre 10 e 20 minutos — é normal, ele está montando o aplicativo de
verdade. Quando terminar, o link para instalar aparece em
<https://expo.dev/accounts> → seu projeto → **Builds**.

No Android, abra o link pelo celular e instale o arquivo. Pode aparecer um aviso
de "origem desconhecida" — é esperado, o aplicativo ainda não está na loja.

> **iPhone é mais burocrático:** exige a conta paga de desenvolvedor da Apple
> (US$ 99/ano) e o aplicativo chega pelo TestFlight. Comece pelo Android.

## Robô 3 — Testes (roda sozinho)

Não precisa apertar nada. A cada alteração no código, ele confere as regras de
segurança do banco e as contas de comissão e cancelamento. Se algo quebrar,
aparece um ✗ vermelho na aba **Actions**.

---

## Se der erro

Clique no ✗ vermelho, depois no passo que falhou. Copie a mensagem e me mande.

Os erros mais comuns:

| Mensagem | O que é |
|---|---|
| `Falta o segredo SUPABASE_DB_URL` | A preparação 1 não foi feita, ou o nome do segredo está diferente |
| `Falta o segredo EXPO_TOKEN` | A preparação 2 não foi feita |
| `Este banco já tem as tabelas` | O robô 1 já rodou antes. Não precisa rodar de novo |
| `password authentication failed` | A senha dentro do endereço de conexão está errada |
| `Network is unreachable` | Você copiou a conexão direta (IPv6). Troque pela aba **Session pooler** |
