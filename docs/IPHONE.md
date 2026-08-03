# Ver o aplicativo no iPhone

Existem três caminhos, e nenhum é tão direto quanto no Android. Este documento
diz o que cada um exige de verdade, para você não instalar 10 GB à toa.

| Caminho | Custo | Exige | O que dá para testar |
|---|---|---|---|
| **Versão web** | grátis | nada | todas as telas, textos e cálculos |
| Simulador de iPhone no Mac | grátis | Xcode + **Mac com chip Apple** | quase tudo, menos câmera/GPS reais |
| iPhone de verdade (TestFlight) | US$ 99/ano | conta de desenvolvedor da Apple | tudo |

---

## Caminho 1 — Versão web (o recomendado hoje)

O aplicativo roda dentro do navegador. Você abre um endereço no Safari do
iPhone e percorre as telas. Não precisa instalar nada, nem no Mac nem no
telefone.

1. Abra <https://github.com/fabinhotinoco/zirix/actions>
2. Clique em **3. Publicar a versão web (link para abrir no iPhone)**
3. **Run workflow** → escolha a branch `claude/pesca-vertical-booking-app-gbclox`
   → **Run workflow**
4. Quando aparecer o ✓ verde, abra o registro e procure a linha
   **Production URL**

Guarde esse endereço: ele não muda a cada publicação.

No iPhone, abra o endereço no Safari, toque no botão de compartilhar e escolha
**Adicionar à Tela de Início**. Ele passa a abrir em tela cheia, com ícone,
parecendo um aplicativo instalado.

**O que a versão web não representa bem:** notificações push, a marca d'água da
foto, o GPS da captura e o comportamento do teclado. Para conferir telas,
textos, fluxo de cadastro, aceite dos contratos e as contas de valores, ela
serve perfeitamente.

---

## Caminho 2 — Simulador de iPhone dentro do Mac

Um iPhone desenhado na tela do Mac, com tela de início, teclado e rotação.

**Depende do seu Mac.** Menu da maçã () → **Sobre este Mac**:

- **Chip Apple (M1, M2, M3, M4…)** → funciona
- **Processador Intel** → provavelmente não. As versões recentes do Xcode e os
  aplicativos gerados para simulador são feitos para os chips Apple. Se a App
  Store não mostra o Xcode para você, é quase sempre isto — ou a versão do
  macOS antiga demais para a versão atual do Xcode

Se o seu Mac tem chip Apple:

1. **App Store** → busque **Xcode** → Instalar (~10 GB, demora)
2. Abra o Xcode uma vez e aceite os termos
3. No GitHub, robô **2. Gerar o aplicativo para testar**, opção
   **`ios-simulador`**
4. Baixe o arquivo `.tar.gz` em <https://expo.dev/accounts> → projeto →
   **Builds**
5. Xcode → menu **Xcode** → **Open Developer Tool** → **Simulator**
6. Dois cliques no `.tar.gz` para descompactar, e arraste o
   `PescaVerticalAPP.app` para dentro da janela do iPhone simulado

---

## Caminho 3 — iPhone de verdade

Único jeito de testar câmera, GPS e notificações no aparelho, e obrigatório
antes de publicar na App Store de qualquer forma.

1. Assine a **Apple Developer Program** (US$ 99/ano) em
   <https://developer.apple.com/programs/>
2. Me avise: eu configuro o build e o envio para o TestFlight
3. Você recebe um convite por e-mail e instala pelo aplicativo TestFlight

Não tem pressa. Dá para construir o aplicativo inteiro usando a versão web e o
Android, e pagar a Apple só quando a publicação estiver perto.

---

## E o Expo Go?

O Expo Go é um aplicativo que abre projetos em desenvolvimento sem instalar
nada. **Ele não serve mais para este projeto no iPhone:** a versão da App Store
ficou parada numa versão antiga do Expo, e a forma atual de usá-lo no iPhone
passa por criar a sua própria cópia dele e distribuí-la pelo TestFlight — o que
exige justamente a conta paga da Apple. Mesmo custo do caminho 3, com menos
vantagem.

No Android o Expo Go continua funcionando, mas ali o caminho do arquivo `.apk`
já resolve, e é mais fiel ao aplicativo final.
