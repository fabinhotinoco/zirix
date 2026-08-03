# Ver o aplicativo num iPhone — sem pagar a Apple

Existem dois jeitos de o aplicativo aparecer num iPhone. Este guia é sobre o
primeiro, que é grátis.

| Jeito | Custo | O que você precisa |
|---|---|---|
| **iPhone simulado dentro do seu Mac** | grátis | instalar o Xcode |
| iPhone de verdade, pelo TestFlight | US$ 99/ano (conta de desenvolvedor da Apple) | conta paga + convite pelo TestFlight |

O iPhone simulado é um iPhone completo desenhado na tela do Mac: tem tela de
início, teclado, rotação, câmera falsa. Serve para ver o aplicativo funcionando
e navegar por todas as telas. **Não serve** para testar coisas que dependem do
aparelho físico — GPS real, câmera real e notificações push não funcionam ali.

---

## Passo 1 — Instalar o Xcode (uma vez só)

1. Abra a **App Store** no seu Mac (o ícone azul com o "A")
2. Busque por **Xcode**
3. Clique em **Obter** / **Instalar**

São cerca de 10 GB. Demora bastante — deixe baixando e vá fazer outra coisa.
Não precisa criar conta nenhuma da Apple para isso.

Quando terminar, **abra o Xcode uma vez** e aceite os termos que ele pedir. Ele
vai instalar mais alguns componentes sozinho. Depois pode fechar.

---

## Passo 2 — Mandar montar o aplicativo

1. Abra <https://github.com/fabinhotinoco/zirix/actions>
2. Na lista da esquerda, clique em **2. Gerar o aplicativo para testar**
3. Botão **Run workflow** (à direita)
4. Em **Use workflow from**, escolha a branch
   `claude/pesca-vertical-booking-app-gbclox`
5. Em **Para qual celular**, escolha **`ios-simulador`**
6. **Run workflow**

Demora de 10 a 20 minutos. Quando aparecer o ✓ verde, está pronto.

> Escolher `ios` em vez de `ios-simulador` tenta montar o aplicativo para um
> iPhone de verdade — e aí a conta paga da Apple é obrigatória. Para o
> simulador, tem que ser `ios-simulador`.

---

## Passo 3 — Baixar o arquivo

1. Abra <https://expo.dev/accounts>
2. Entre no projeto **aplicativo-de-agendamento-pesca-vertical**
3. Menu **Builds**, clique no build mais recente (iOS)
4. Botão **Download**

Vem um arquivo terminado em **`.tar.gz`**. Ele cai na pasta **Downloads**.

---

## Passo 4 — Abrir o iPhone simulado

1. Abra o **Xcode**
2. No menu de cima: **Xcode** → **Open Developer Tool** → **Simulator**

Uma janelinha em formato de iPhone aparece na tela. Deixe ela aberta.

> Se aparecer um iPhone que não é o que você quer, no menu do Simulator vá em
> **File** → **Open Simulator** e escolha outro modelo.

---

## Passo 5 — Instalar o aplicativo no iPhone simulado

1. Abra a pasta **Downloads** no Finder
2. **Dois cliques** no arquivo `.tar.gz` — ele vira uma pasta ou um arquivo
   chamado **`PescaVerticalAPP.app`**
3. **Arraste** o `PescaVerticalAPP.app` para dentro da janela do iPhone simulado
   e solte

O ícone aparece na tela de início do iPhone simulado. Clique nele para abrir.

---

## Passo 6 — Usar

O aplicativo abre na tela de entrada. Digite um e-mail, peça o código, e o
Supabase manda o código de 6 dígitos para esse e-mail de verdade — o simulador
não impede isso, porque quem envia é o servidor.

Para digitar, você pode usar o teclado do próprio Mac.

---

## Se der errado

| O que aconteceu | O que fazer |
|---|---|
| O build falhou com "Apple Developer account" | Você escolheu `ios` em vez de `ios-simulador`. Rode de novo com `ios-simulador` |
| O arquivo baixado é `.ipa`, não `.tar.gz` | Mesma coisa: foi build para iPhone de verdade. Não serve no simulador |
| Arrastei e não aconteceu nada | Confira se soltou **dentro** da tela do iPhone desenhado, e se o arquivo é o `.app` (não o `.tar.gz`) |
| "Unable to install" / arquitetura incompatível | O Mac precisa ser Apple Silicon (M1 em diante) ou o build precisa ser refeito. Me avise |
| O aplicativo abre e fecha na hora | Provavelmente falta configuração do Supabase. Copie o que aparece e me mande |

---

## E o iPhone de verdade?

Quando quiser instalar no seu próprio iPhone, para levar no barco e testar
câmera e GPS:

1. Assine a **Apple Developer Program** (US$ 99/ano) em
   <https://developer.apple.com/programs/>
2. Me avise — eu configuro o build de iPhone e o envio para o TestFlight
3. Você recebe um convite por e-mail e instala pelo aplicativo TestFlight

Esse passo é obrigatório de qualquer jeito antes de publicar na App Store, mas
não tem pressa: dá para desenvolver o aplicativo inteiro no Android e no
simulador, e pagar a Apple só perto da publicação.
