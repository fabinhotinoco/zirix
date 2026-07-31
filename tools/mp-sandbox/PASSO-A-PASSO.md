# Teste do Mercado Pago — passo a passo sem terminal

Este guia é para quem não quer mexer em linha de comando. **Você faz 5 coisas no navegador. Eu faço o
resto.** Cada passo leva poucos minutos.

Não envolve dinheiro de verdade: usamos contas e credenciais **de teste**, com dinheiro fictício.

---

## O que estamos tentando descobrir

Quando um cliente cancela e devolvemos parte do dinheiro, o Mercado Pago tira essa devolução das
**duas** contas (a do guia e a da plataforma), ou tira **tudo da conta do guia**?

A resposta muda como o cancelamento vai ser programado. É a única pergunta que a documentação não
responde com segurança — por isso o teste.

---

## Passo 1 — Liberar dois endereços de internet

O ambiente onde eu trabalho bloqueia acesso a sites externos por padrão. Preciso de dois liberados:

```
api.mercadopago.com
auth.mercadopago.com.br
```

Isso fica nas **configurações do ambiente do Claude Code na web**, na parte de rede
(*network* / *egress*). Adicione os dois endereços à lista de permitidos e salve.

*Se não encontrar essa opção, me avise — seguimos por outro caminho.*

---

## Passo 2 — Criar a aplicação no Mercado Pago

1. Acesse <https://www.mercadopago.com.br/developers/panel/app> com a **sua** conta.
2. Clique em **Criar aplicação**.
3. Nome: qualquer um — ex.: `Plataforma Pescarias (teste)`.
4. Em "Que solução de pagamento você vai integrar?", escolha **Pagamentos online**.
5. Quando perguntar se você é um **marketplace / plataforma que processa pagamentos de terceiros**, responda **sim**. Esse é o ponto que libera o split — se errar aqui, o teste não funciona.
6. Crie a aplicação.

Depois de criada, procure a seção **Redirect URI** (pode estar em "Configurações" ou "Detalhes da
aplicação") e cadastre exatamente isto:

```
https://example.com/callback
```

Não precisa ser um site seu. Ele só serve para o navegador "cair" numa página depois que o guia
autoriza — e é dessa página que vamos copiar um código.

---

## Passo 3 — Criar duas contas de teste

Ainda no painel da aplicação, procure **Contas de teste** (ou "Test users").

Crie **duas** contas, ambas com país **Brasil** e algum saldo (ex.: R$ 5.000):

- **Conta A — o guia**: quem vende a pescaria e recebe o dinheiro.
- **Conta B — o pescador**: quem paga o Pix.

O painel mostra usuário e senha de cada uma. **Anote os dois pares** — vamos precisar deles.

> Isso evita você precisar de uma segunda conta real de Mercado Pago. São contas fictícias, com
> dinheiro fictício.

---

## Passo 4 — Me enviar as credenciais de teste

Na página da aplicação existe uma seção de **credenciais**, com duas abas: *produção* e *teste*.

**Abra a aba de TESTE** e me mande estes dois valores:

- `Client ID` (também aparece como *Application ID*)
- `Client Secret`

⚠️ **Só as de teste.** As de produção não devem ser enviadas por chat em hipótese alguma. As de teste
podem ser regeneradas com um clique depois que terminarmos, e não movimentam dinheiro real.

---

## Passo 5 — Autorizar e pagar

A partir daqui eu conduzo, e você só clica:

1. Eu gero um **link de autorização** e te mando.
2. Você abre o link **logado na Conta A (o guia)** — em janela anônima, para não confundir com a sua conta. Clica em **Autorizar**.
3. O navegador vai para `https://example.com/callback?code=ALGUMA-COISA`. A página vai parecer quebrada — **é esperado**. Copie tudo o que vem depois de `code=` e me mande.
4. Eu crio uma cobrança Pix de teste e te mando o **código copia e cola**.
5. Você paga entrando no Mercado Pago **com a Conta B (o pescador)** e colando o código.
6. Eu acompanho a aprovação, faço um estorno parcial e te mostro o resultado.

No fim eu te digo exatamente quanto entrou e saiu de cada conta, e ajusto o planejamento conforme o
que o Mercado Pago realmente fizer.

---

## Depois do teste

Volte ao painel e clique em **regenerar credenciais de teste**. Leva um segundo e invalida tudo o que
passou por aqui.

---

## Se preferir não fazer isso agora

É legítimo adiar. O teste serve para descobrir um detalhe da Fase 4 com antecedência — dá para
começar a Fase 1 (cadastro, agenda, reservas) sem ele e testar o pagamento quando chegarmos lá.

O custo de adiar é retrabalho **se** o Mercado Pago se comportar diferente do esperado; o custo de
fazer agora são estes 20 minutos. Sua escolha.
