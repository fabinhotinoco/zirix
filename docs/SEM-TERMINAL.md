# Tudo pelo navegador — sem instalar nada

Este guia é para quem não quer (ou não pode) usar o Terminal. Você faz tudo em
páginas de site, clicando. Os robôs no GitHub fazem o trabalho pesado.

São **quatro preparações que você faz uma única vez** e depois só aperta botão.
(A quarta só é necessária quando o envio de e-mails começar a esbarrar no limite.)

---

## Preparação 1 — Guardar a senha do banco no GitHub

O robô precisa de permissão para criar as tabelas no seu Supabase.

### a) Pegar o endereço de conexão

1. Entre no <https://supabase.com/dashboard> e abra seu projeto
2. Na engrenagem **Project Settings** (canto inferior esquerdo) → **Database**
3. Procure a caixa **Connection string**
4. **Escolha a aba `Session pooler`** — não a `Direct connection` nem a
   `Transaction pooler`. A diferença visível é a **porta: 5432**, não 6543
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
>
> **Copie a linha inteira e edite só a senha.** Trocar apenas o endereço do
> servidor numa linha antiga não funciona: o pooler recusa o usuário `postgres`
> sozinho, e a mensagem de erro fala em senha errada — o que leva você a trocar
> a senha à toa.

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

## Preparação 3 — Fazer o Supabase mandar código, e não link

1. No painel do Supabase: **Authentication** → **Providers** → **Email**
2. Deixe **Enable Email provider** ligado
3. Salve

### Trocar o link pelo código de 6 dígitos

Por padrão o Supabase manda um **link** de confirmação. O aplicativo não espera
link nenhum: ele espera um **código de 6 dígitos** digitado na tela. Quem decide
entre um e outro é o texto do e-mail — se o modelo contém `{{ .ConfirmationURL }}`,
vai link; se contém `{{ .Token }}`, vai código.

E o link, além de não servir, **nem abre**: ele termina no endereço configurado
em *Site URL*, que num projeto novo é `http://localhost:3000` — um endereço que
só existiria num computador rodando um servidor. Por isso a página fica em
branco ou dá erro.

1. **Authentication** → **Emails** (ou *Email Templates*)
2. Abra o modelo **Magic Link** e substitua o corpo inteiro por:

   ```html
   <h2>Seu código de acesso</h2>
   <p>Use este código no aplicativo PescaVerticalAPP:</p>
   <p style="font-size:28px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>
   <p>Ele vale por uma hora. Se não foi você que pediu, ignore este e-mail.</p>
   ```

3. Salve
4. **Repita exatamente o mesmo** no modelo **Confirm signup** — ele é o usado
   na primeira vez que um endereço entra no aplicativo. Trocar só o Magic Link
   resolve para quem já tem conta e deixa quem está entrando pela primeira vez
   recebendo link

### Ajustar o endereço de retorno

Mesmo mandando código, vale corrigir: **Authentication** → **URL Configuration**

- **Site URL**: `https://aplicativo-de-agendamento-pesca-vertical.expo.app`
- Em **Redirect URLs**, acrescente também `pescaverticalapp://` — é o endereço
  do aplicativo instalado no celular

---

## Preparação 4 — Serviço de e-mail próprio (quando aparecer "email rate limit exceeded")

O Supabase manda os códigos de login por um serviço de e-mail embutido, que é só
para desenvolvimento: **duas mensagens por hora no projeto inteiro**. Na terceira
tentativa aparece `email rate limit exceeded`. Não é defeito do aplicativo, e o
limite é do projeto, não do seu endereço — trocar de e-mail não adianta.

Enquanto não trocar o serviço, a saída é esperar uma hora. Para resolver de vez:

### a) Criar a conta no Resend

1. Entre em <https://resend.com> e crie uma conta (grátis: 3.000 e-mails/mês)
2. Menu **API Keys** → **Create API Key** → copie a chave (só aparece uma vez)

> **Sem um domínio próprio, o Resend só entrega para o e-mail dono da conta.**
> Para testar sozinho, basta. Para os pescadores receberem de verdade, é preciso
> registrar um domínio (ex.: `pescavertical.com.br`) e verificá-lo no Resend —
> ele mostra os registros de DNS a cadastrar. Vale fazer antes do primeiro
> cliente real.

### b) Ligar no Supabase

1. Painel do Supabase → **Project Settings** → **Authentication** → role até
   **SMTP Settings**
2. Ligue **Enable Custom SMTP** e preencha:

   | Campo | Valor |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a chave que você copiou |
   | Sender email | `onboarding@resend.dev` (ou `nao-responda@seudominio` depois de verificar o domínio) |
   | Sender name | `Pesca Vertical` |

3. Salve
4. Ainda em **Authentication**, procure **Rate Limits** e aumente o número de
   e-mails por hora. **Isso não muda sozinho ao ligar o SMTP:** sem esse passo o
   limite antigo continua valendo e o erro volta

⚠️ A chave do Resend é secreta: ela vai só nesse campo do painel do Supabase.
Não precisa ir para o GitHub nem para o código.

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
4. Em **Para qual celular**, escolha uma das opções abaixo
5. **Run workflow**

| Opção | O que gera | Precisa de |
|---|---|---|
| `android` | arquivo `.apk` para instalar num Android | nada |
| `ios-simulador` | iPhone simulado dentro do seu Mac | Xcode + Mac com chip Apple |
| `ios` | iPhone de verdade, via TestFlight | conta paga da Apple (US$ 99/ano) |
| `all` | Android e iPhone de verdade | conta paga da Apple |

Demora entre 10 e 20 minutos — é normal, ele está montando o aplicativo de
verdade. Quando terminar, o link para baixar aparece em
<https://expo.dev/accounts> → seu projeto → **Builds**.

No Android, abra o link pelo celular e instale o arquivo. Pode aparecer um aviso
de "origem desconhecida" — é esperado, o aplicativo ainda não está na loja.

> **Quer ver no iPhone?** Os três caminhos possíveis, com o que cada um exige
> de verdade, estão em [docs/IPHONE.md](IPHONE.md). O mais simples não passa por
> aqui: é o robô 3, abaixo.

## Robô 3 — Publicar a versão web (link para o iPhone)

1. Aba **Actions** → **3. Publicar a versão web (link para abrir no iPhone)**
2. **Run workflow** → mesma branch → **Run workflow**
3. No fim do registro, copie a linha **Production URL**

Esse endereço abre em qualquer navegador — Mac, iPhone, Android, Windows. É a
forma mais rápida de percorrer as telas, e não exige instalar nada.

Não substitui o aplicativo de verdade: câmera, GPS e notificações se comportam
diferente no navegador.

## Robô 4 — Conferir o que está gravado no banco

1. Aba **Actions** → **4. Conferir o que está gravado no banco**
2. **Run workflow** → mesma branch → **Run workflow**

Só lê, não altera nada. Mostra quem se cadastrou, quantos aceites existem e —
o que mais importa — se o **hash** de cada aceite ainda bate com o texto
publicado. É esse hash que permite provar, meses depois, exatamente qual texto
a pessoa aceitou.

Se aparecer `ATENCAO: hash diferente do documento vigente`, ou o texto foi
editado sem publicar nova versão, ou o aceite se refere a uma versão anterior.
Nos dois casos vale investigar antes de o documento ser usado como prova.

## Robô 5 — Atualizar o banco (sem apagar nada)

1. Aba **Actions** → **5. Atualizar o banco (sem apagar nada)**
2. **Run workflow** → mesma branch → **Run workflow**

Aplica no banco o que foi acrescentado depois da criação inicial. **Não apaga
nada** e pode rodar quantas vezes quiser.

Rode sempre que eu avisar que houve mudança no banco. Diferente do robô 1, que
só serve para um projeto vazio, este funciona com o banco em uso.

## Robô 6 — Diagnosticar o login por e-mail

Só lê. Mostra se o Supabase criou a conta, se enviou o código e qual erro
registrou. Serve para separar "não enviou" de "enviou e não chegou".

## Robô 7 — Criar uma conta de acesso (sem depender de e-mail)

Cria uma conta com **senha**, já com o e-mail confirmado. Nenhum e-mail é
enviado — é o caminho para entrar no aplicativo enquanto o envio de e-mail do
projeto estiver com problema.

Antes de rodar, crie dois segredos em
<https://github.com/fabinhotinoco/zirix/settings/secrets/actions>:

| Nome | Valor |
|---|---|
| `ADMIN_EMAIL` | o e-mail da sua conta de administrador |
| `ADMIN_SENHA` | uma senha sua, de 8 caracteres ou mais |
| `GUIA_EMAIL` | um **outro** e-mail, para testar o lado do guia |
| `GUIA_SENHA` | outra senha, de 8 caracteres ou mais |

Ao rodar, escolha em **Qual conta criar** entre `admin` e `guia`. Ter os dois
pares guardados evita o vaivém de reescrever o mesmo segredo — e é no vaivém
que se perde a senha da conta que já existia.

> Vão como segredo, e não como campo do formulário, porque **este repositório é
> público**: campos e registros de execução ficam visíveis para qualquer pessoa.
> Segredos, não.

Depois: **Actions** → **7. Criar uma conta de acesso** → **Run workflow**.

> Para as duas contas conviverem no mesmo computador, abra uma delas numa
> **janela anônima**. Assim você aprova o guia como master numa janela e
> continua como guia na outra, sem ficar entrando e saindo.

Para entrar, use a aba **Senha** na tela de entrada do aplicativo. O cadastro
(nome e aceite dos documentos) continua igual, na tela seguinte.

Rodar de novo com uma senha diferente **troca a senha** da conta, em vez de
criar outra.

## Robô 8 — Testes (roda sozinho)

Não precisa apertar nada. A cada alteração no código, ele confere as regras de
segurança do banco, as contas de comissão e cancelamento, e percorre as telas de
reserva num navegador de verdade. Se algo quebrar, aparece um ✗ vermelho na aba
**Actions**.

## Robô 9 — Liberar datas de reservas não pagas (roda sozinho)

De 15 em 15 minutos, marca como expirada toda reserva que passou do prazo de
pagamento, devolvendo a data à agenda.

É faxina, não a trava principal. Quem chega para reservar já limpa o próprio dia
antes de tentar, e a agenda do cliente ignora reserva vencida. Se este robô
ficar uma semana sem rodar, **nenhuma data fica presa** — só o rótulo de
reservas abandonadas fica desatualizado, o que atrapalha relatório, não venda.

Usa o mesmo `SUPABASE_DB_URL`. Também pode ser disparado à mão em **Actions** →
**9. Liberar datas de reservas não pagas** → **Run workflow**.

## Robô 10 — Liberar um guia para teste (sem Mercado Pago)

**Atalho de teste. Não é parte do produto.**

O banco só deixa abrir data na agenda — e só mostra o barco ao cliente — se o
guia tiver o Mercado Pago conectado. É a porta que impede alguém reservar e
pagar sem que exista caminho para o dinheiro chegar ao guia.

A conexão de verdade é por OAuth e entra na etapa de pagamento. Até lá, este
robô marca a **conta de teste** (a do segredo `GUIA_EMAIL`) como conectada,
para dar para percorrer o fluxo inteiro: abrir data → o cliente encontrar o
barco → reservar.

É seguro agora justamente porque o pagamento ainda não existe: não há como
cobrar ninguém por um caminho que não foi construído. **Não use em guia de
verdade depois que o pagamento estiver no ar.**

Rodar com **revogar** desfaz.

## Robô 11 — Definir quem é o administrador master

O papel de master **não** aparece na tela de cadastro. Se aparecesse, qualquer
pessoa se promoveria a dona da plataforma. Ele é definido aqui, fora do
aplicativo, por quem tem a senha do banco.

É o master que aprova guias, define a comissão caso a caso e vê o extrato
consolidado. **Sem uma conta master, nenhum guia sai de "pendente"** — e sem
guia aprovado o cliente não encontra barco nenhum.

Usa o segredo `ADMIN_EMAIL` (o mesmo do robô 7). A conta precisa já existir e
já ter concluído o cadastro no aplicativo — nome preenchido e documentos
aceitos. Se faltar alguma dessas coisas, o robô diz exatamente qual.

Rodar com **cliente** devolve a conta ao papel comum.

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
| `password authentication failed for user "postgres"` | No pooler o usuário precisa ser `postgres.SEUPROJETO`. Copie a linha inteira da aba Session pooler, sem editar o usuário |
| `A porta 6543 é o pooler em modo transação` | Troque apenas o `6543` por `5432` no segredo. O resto do endereço é igual |
| `Token has expired or is invalid` sempre, mesmo com o código recém-chegado | Peça um código novo e use **o mais recente**: cada pedido invalida o anterior. Se o modelo de e-mail ainda tiver o link junto, qualquer varredura de segurança que abra o link consome o código antes de você |
| Chega um **link** em vez do código de 6 dígitos | Os modelos de e-mail ainda usam `{{ .ConfirmationURL }}`. Troque por `{{ .Token }}` nos modelos *Magic Link* e *Confirm signup* (preparação 3) |
| O link do e-mail não abre / página em branco | Ele aponta para o *Site URL*, que num projeto novo é `localhost:3000`. Corrija em Authentication → URL Configuration (preparação 3) |
| `email rate limit exceeded` | O serviço de e-mail embutido do Supabase só manda 2 por hora. Espere uma hora, ou faça a preparação 4 |
| `relation "profiles" already exists` | Uma tentativa anterior parou no meio e deixou o banco incompleto. Rode `supabase/recomecar-do-zero.sql` no SQL Editor: ele limpa e reaplica tudo |
