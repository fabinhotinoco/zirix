# Tudo pelo navegador — sem instalar nada

Este guia é para quem não quer (ou não pode) usar o Terminal. Você faz tudo em
páginas de site, clicando. Os robôs no GitHub fazem o trabalho pesado.

São **seis preparações que você faz uma única vez** e depois só aperta botão.
(A quarta só é necessária quando o envio de e-mails começar a esbarrar no limite;
a quinta, quando chegar a hora de receber pagamento.)

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

## Preparação 5 — Criar a aplicação Marketplace no Mercado Pago

É o que permite cada guia **conectar a conta dele** à plataforma. Sem isso não
existe split: o dinheiro não teria como cair na conta certa, e a sua comissão
não teria como ser retida na origem.

Você faz isso **uma vez só**. Os guias não criam aplicação nenhuma — eles só
clicam em "conectar" dentro do aplicativo.

### a) Escolher a conta certa (decida antes de clicar)

A aplicação tem de nascer dentro da **conta que vai receber a sua comissão** —
a sua, em `fabio@zirix.com.br`. Não é a conta de um guia, nem uma conta nova de
teste.

⚠️ **Isso é difícil de desfazer.** Aplicação do Mercado Pago pertence à conta que
a criou e não se transfere. Se um dia a plataforma passar a faturar por um CNPJ,
será preciso criar outra aplicação naquela conta e **fazer todos os guias
reconectarem** — os tokens antigos não valem para a nova. Se você já sabe que
vai operar por CNPJ, vale abrir a conta do CNPJ agora e criar a aplicação lá.

Duas conferências na conta antes de seguir:

- **Cadastro concluído** (documento, dados bancários, chave Pix). Conta que ainda
  não pode receber dinheiro cria a aplicação normalmente, mas quebra no primeiro
  pagamento — e o erro que aparece não fala em cadastro.
- **Você entra nela sozinho.** O `client_secret` só aparece para quem entra na
  conta; se o acesso for de outra pessoa, o segredo passa por ela.

### b) Criar a aplicação

Entre em <https://www.mercadopago.com.br/developers/panel> com o e-mail
`fabio@zirix.com.br` e vá em **Suas integrações** → **criar aplicação**. São
quatro telas.

**Tela 2 de 4 — "Escolha o tipo de pagamento que quer integrar"**

- **Pagamentos online** (não "Pagamentos presenciais", que é maquininha e QR Code
  no balcão)
- **"Como você criou a loja?"** → **Com um desenvolvimento próprio**
- **"URL da loja (opcional)"** → `https://aplicativo-de-agendamento-pesca-vertical.expo.app`,
  ou deixe em branco

> ⚠️ **Duas armadilhas nessa tela, as duas já custaram um retrabalho aqui.**
>
> **"Como você criou a loja?" não pergunta se você é um marketplace.** Ela
> pergunta se o código é seu ou se você usou uma plataforma pronta — Shopify,
> Nuvemshop, Wix, VTEX. O nosso é código próprio. Respondendo "Através de uma
> plataforma", o Mercado Pago passa a oferecer a **instalação de um plugin**
> daquela plataforma, em vez de entregar o `client_id`/`client_secret` do OAuth,
> que é exatamente o que precisamos. A pergunta sobre intermediar vendedores, se
> vier, vem em outra tela — é lá que se responde "sim".
>
> **"URL da loja" não é o endereço de retorno do OAuth.** É só o endereço público
> da loja, informativo. O *Redirect URI* se configura depois, com a aplicação já
> criada (item **c** abaixo). Pôr o endereço da função aqui não quebra nada, mas
> também não configura nada — e dá a impressão de que o passo foi feito.

**Telas 3 e 4** — produto a integrar: **Checkout Pro**. Se aparecer pergunta
sobre **ser marketplace / agregador / intermediar vendedores**, responda **sim**.
Nome da aplicação: `PescaVerticalAPP`.

### c) Configurar o OAuth

Com a aplicação criada, abra **Configurações da aplicação** e role até
**Configuração avançada**.

**"Adicione a URL de redirecionamento se sua integração for feita com OAuth"** —
cole exatamente isto, sem barra no fim:

```
https://ykdbdpdepkdtyxtcwwex.supabase.co/functions/v1/mp-oauth
```

**"Utiliza o fluxo de código de atualização com o PKCE?"** → **Não**. O PKCE
existe para quem **não consegue guardar um segredo** — o aplicativo no celular.
Como a troca do código pelo token acontece no servidor, com o `client_secret`,
o PKCE seria proteção redundante e mudaria o formato da chamada.

**Permissões da aplicação** — marque **as três**:

| Permissão | Para quê | Se faltar |
|---|---|---|
| `read` | Ler os dados do guia e consultar pagamentos | Não dá para conferir o que foi pago |
| `write` | **Criar a cobrança em nome do guia** | O guia conecta a conta e nenhum pagamento sai |
| `offline_access` | Devolve o *refresh token* | O acesso do guia expira e ele tem de reconectar a mão; até reconectar, as reservas dele não geram cobrança |

**Por que esse endereço de retorno, e não o do aplicativo.** Ao fim do "conectar",
o Mercado Pago devolve um código que precisa ser **trocado pelo token do guia**, e
essa troca exige o `client_secret`. O aplicativo não pode fazer isso: ele é
distribuído para o celular de todo mundo, e qualquer segredo dentro dele é
segredo de ninguém — quem o extraísse conseguiria falar com o Mercado Pago em
nome da plataforma. Por isso o retorno vai para um endereço **no servidor**
(uma função do Supabase, publicada por robô na Fase 4), onde o segredo pode
morar. O endereço já pode ser cadastrado agora, mesmo antes de a função existir.

O texto tem de ser **idêntico** dos dois lados — o mesmo que o aplicativo envia
na hora de conectar. Uma barra a mais no fim já faz o Mercado Pago recusar com
`redirect_uri mismatch`.

### d) Guardar as duas credenciais no GitHub

Aberta a aplicação, o painel mostra **Client ID** e **Client Secret** (o segredo
costuma ficar escondido atrás de um "mostrar").

1. Abra <https://github.com/fabinhotinoco/zirix/settings/secrets/actions>
2. **New repository secret** → **Name**: `MP_CLIENT_ID` → cole o Client ID →
   **Add secret**
3. **New repository secret** de novo → **Name**: `MP_CLIENT_SECRET` → cole o
   Client Secret → **Add secret**

⚠️ **O `client_secret` é senha, e este repositório é público.** Ele vai em um
lugar só: o campo **Secret** do GitHub. Não cole em mensagem, e-mail ou chat —
**inclusive para mim** — nem em campo de formulário de robô, porque o que se
digita ali fica visível no registro público da execução. Se vazar por engano,
o próprio painel do Mercado Pago tem a opção de **gerar um novo** `client_secret`;
o antigo para de valer na hora.

O `client_id` não é segredo (ele viaja no link de conectar, à vista), mas guardar
os dois juntos evita ter de procurar depois.

### e) Credenciais de teste (opcional, mas recomendado)

Dentro da mesma aplicação há uma área de **credenciais de teste** e a criação de
**contas de teste** (uma "vendedora", que faz o papel do guia, e uma
"compradora"). É com elas que dá para conferir o split e o estorno parcial sem
dinheiro real — em especial o caso do **guia sem saldo**, que é o único ponto do
desenho de cancelamento que ainda não foi confirmado na prática.

Se você criar as contas de teste, me avise: eu monto o robô que roda essa
conferência antes de qualquer centavo real entrar.

---

## Preparação 6 — Deixar um robô publicar as funções do servidor

Até agora nenhuma parte do sistema rodava **no servidor**. Tudo era banco de
dados (robô 5) ou aplicativo (robô 2). A Fase 4 muda isso: a troca do código do
Mercado Pago pelo token do guia precisa acontecer num lugar onde o
`client_secret` possa morar, e esse lugar é uma **função do Supabase**.

Publicar função normalmente é comando de Terminal. Para continuar sem Terminal,
um robô publica por você — e para isso ele precisa de permissão na sua conta
Supabase.

### a) Criar o token

1. Entre em <https://supabase.com/dashboard/account/tokens>
2. **Generate new token**, dê um nome (ex.: `github`)
3. **Copie** — ele só aparece uma vez

### b) Guardar no GitHub

1. Abra <https://github.com/fabinhotinoco/zirix/settings/secrets/actions>
2. **New repository secret** → **Name**: `SUPABASE_ACCESS_TOKEN` → cole → **Add secret**

⚠️ Esse token dá acesso à sua conta Supabase inteira. Vale a mesma regra dos
outros: só no campo **Secret** do GitHub, nunca em mensagem ou chat — inclusive
para mim. Se vazar, dá para revogá-lo na mesma página onde foi criado.

> **Por que o `client_secret` do Mercado Pago vai precisar existir em dois
> lugares.** No GitHub, para o robô 12 conferir; e dentro do Supabase, para a
> função usar na hora da troca. O robô que publica a função copia um para o
> outro sozinho — o valor sai de um cofre e entra em outro, sem passar por
> tela, por registro de execução ou por conversa.

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
| `CLIENTE_EMAIL` | um **terceiro** e-mail, para testar o lado do pescador |
| `CLIENTE_SENHA` | outra senha, de 8 caracteres ou mais |

Ao rodar, escolha em **Qual conta criar** entre `admin`, `guia` e `cliente`.

São três porque os três papéis enxergam coisas diferentes — e o master enxerga
tudo. Testar como cliente usando a conta de master esconde justamente o que se
quer conferir. Ter os três pares guardados evita o vaivém de reescrever o mesmo
segredo, e é no vaivém que se perde a senha da conta que já existia.

> Não precisa ser um e-mail de verdade que você acesse: nenhuma mensagem é
> enviada, a conta já nasce confirmada. Serve qualquer endereço que você
> lembre, como `pescador@teste.com`.

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

## Robô 12 — Conferir o Mercado Pago

Confirma que os segredos `MP_CLIENT_ID` e `MP_CLIENT_SECRET` estão guardados,
que formam um par válido e que a aplicação pertence à conta certa. Só lê: não
move dinheiro e não toca em conta de guia nenhum.

1. Aba **Actions** → **12. Conferir o Mercado Pago**
2. **Run workflow** → escolha a branch → **Run workflow**

Deve terminar com:

```
✓ credenciais válidas — o Mercado Pago devolveu um token
✓ conta 000000000 · apelido ALGUMACOISA · país MLB
```

E imprime o **link de conexão do guia**. Abra esse link num navegador: tem de
aparecer a tela do Mercado Pago pedindo autorização. Se aparecer erro falando em
`redirect_uri`, o endereço cadastrado na aplicação está diferente do que o
aplicativo vai enviar.

**Por que existe.** Segredo guardado no GitHub não avisa quando está errado.
`client_secret` copiado pela metade, ou copiado **antes** de renovar as
credenciais de produção — renovar troca o segredo —, fica lá parecendo certo. O
defeito só apareceria no dia em que o primeiro guia tentasse conectar a conta,
com uma mensagem que fala em "credenciais inválidas" e não em "você guardou a
versão antiga". Aqui isso se descobre apertando um botão, antes de existir
dinheiro.

Nada secreto aparece no registro: o `client_secret` e o token são mascarados
antes de qualquer coisa poder ecoá-los, e o e-mail do titular da conta não é
impresso.

---

## Robô 13 — Publicar as funções do servidor

Publica a função `mp-oauth`, que é quem recebe o guia de volta do Mercado Pago
e guarda o token dele cifrado.

**Precisa da Preparação 6** (`SUPABASE_ACCESS_TOKEN`) e da Preparação 5
(`MP_CLIENT_ID` e `MP_CLIENT_SECRET`).

1. Aba **Actions** → **13. Publicar as funções do servidor**
2. **Run workflow** → escolha a branch → **Run workflow**

Deve terminar com:

```
✓ a função está no ar e recusa chamada sem código, como deve
```

**O que ele faz além de publicar.** Leva os segredos do Mercado Pago do cofre do
GitHub para o cofre do Supabase, e **gera a chave que cifra os tokens dos
guias** — uma vez só, na primeira publicação. Essa chave não passa por tela, por
chat nem pelo registro da execução: ninguém precisa vê-la, nem você, nem eu.

> ⚠️ **A chave de cifra não pode ser trocada depois.** Trocá-la torna ilegível
> todo token já guardado, e cada guia teria de reconectar a conta. Por isso o
> robô confere se ela já existe antes de gerar. Se algum dia você apagá-la à mão
> no painel do Supabase, é isso que acontece.

Rodar o robô de novo é seguro: ele republica a função e mantém a chave.

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
