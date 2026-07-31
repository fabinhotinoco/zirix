# Rodar o PescaVerticalAPP no seu Mac

Passo a passo do zero. Cada bloco é para **copiar e colar inteiro** no Terminal.

> Não use os comentários que aparecem depois de `#` em instruções soltas — no
> zsh do Mac eles não são ignorados e viram erro. Aqui não tem nenhum.

---

## 1. Instalar o Node.js

`npm` e `npx` vêm com o Node. Se ele não estiver instalado, o Terminal responde
`command not found`.

Para conferir:

```
node --version
```

Se aparecer algo como `v22.x.x`, pule para o passo 2.

Se aparecer `command not found`:

1. Abra <https://nodejs.org/pt-br/download>
2. Baixe o instalador **macOS Installer (.pkg)** da versão **LTS**
3. Abra o arquivo baixado e siga avançando até o fim
4. **Feche o Terminal e abra de novo** — sem isso ele não enxerga o Node

Confira outra vez:

```
node --version
npm --version
```

Os dois precisam responder com um número.

---

## 2. Baixar o projeto

```
cd ~/Documents
git clone https://github.com/fabinhotinoco/zirix.git
cd zirix
git checkout claude/pesca-vertical-booking-app-gbclox
```

Se o `git clone` pedir para instalar as "ferramentas de linha de comando"
(Command Line Tools), aceite, espere terminar e rode o comando de novo.

Se pedir usuário e senha do GitHub, use seu usuário e um **token de acesso
pessoal** no lugar da senha (o GitHub não aceita mais senha) — ou baixe o ZIP
pelo site, em **Code → Download ZIP**, e descompacte em `~/Documents/zirix`.

---

## 3. Configurar as chaves

```
cd apps/mobile
cp .env.example .env
open -e .env
```

O TextEdit vai abrir o arquivo. A linha da URL já vem preenchida. Na linha
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, apague o texto
`cole-aqui-a-chave-publicavel` e cole a chave que o Supabase mostra como
**publishable** (começa com `sb_publishable_`).

Se o seu painel ainda mostrar apenas a chave antiga **anon** (um texto longo
começando com `eyJ`), troque o nome da linha para
`EXPO_PUBLIC_SUPABASE_ANON_KEY=` e cole essa. O app aceita as duas.

Salve com **Cmd + S** e feche o TextEdit.

---

## 4. Instalar as bibliotecas e iniciar

```
npm install
npx expo start
```

A primeira vez demora alguns minutos. No fim aparece um **QR Code** no Terminal.

---

## 5. Abrir no celular

1. Instale o app **Expo Go** (App Store ou Play Store)
2. **iPhone:** abra a câmera e aponte para o QR Code
   **Android:** abra o Expo Go e use *Scan QR code*
3. O celular e o Mac precisam estar **na mesma rede Wi-Fi**

O caminho a testar é: e-mail → código de 6 dígitos → cadastro → aceites → início.

---

## Se algo der errado

**"Não foi possível carregar os documentos" na tela de cadastro**
O banco ainda não foi preparado. Rode o `supabase/setup-completo.sql` no SQL
Editor do Supabase — ver `supabase/COMO-APLICAR.md`.

**O código de 6 dígitos não chega no e-mail**
No painel do Supabase: **Authentication → Providers → Email**. O projeto pode
estar configurado para mandar link de confirmação em vez de código. Confira
também a caixa de spam.

**O QR Code não conecta**
Normalmente é rede: Mac e celular em Wi-Fi diferentes, ou rede corporativa
bloqueando. Tente `npx expo start --tunnel`, que é mais lento porém contorna
quase tudo.

**Qualquer outro erro**
Copie a mensagem inteira do Terminal e me mande. É mais rápido eu ler o erro
real do que adivinhar.

---

## Detalhe sem importância

O `(base)` no começo da linha do Terminal é do Anaconda (Python). Não atrapalha
em nada aqui.
