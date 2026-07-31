# Teste de split e estorno no Mercado Pago

Kit mínimo para validar, **antes de construir o app**, as três hipóteses financeiras mais arriscadas
do planejamento:

1. O guia consegue conectar a conta dele à aplicação Marketplace por OAuth.
2. Uma cobrança Pix criada em nome do guia **retém a comissão na origem** e credita cada parte na conta certa.
3. O **estorno parcial** (a política de cancelamento) devolve proporcionalmente das duas contas — ou não, e aí precisamos compensar no nosso lado.

Sem dependências. Só Node 18+ (aqui foi testado com Node 22).

> **Rode na sua máquina.** O ambiente onde o planejamento foi escrito bloqueia `api.mercadopago.com`
> por política de rede, então o teste não roda de lá.

---

## Antes de começar

Você vai precisar de **duas contas** Mercado Pago:

- a **sua** (plataforma) — é onde a aplicação Marketplace é criada e onde a comissão cai;
- uma **segunda conta** fazendo o papel de guia. Pode ser uma conta de teste criada no painel de desenvolvedores, ou a conta de um guia real disposto a testar.

**Nesta fase, use apenas credenciais de TESTE.** Elas começam com `TEST-`.

### 1. Criar a aplicação Marketplace

1. Entre em <https://www.mercadopago.com.br/developers/panel/app> com a **sua** conta.
2. **Criar aplicação** → produto **Pagamentos online** → marque que é uma **plataforma de terceiros / marketplace**.
3. Em **Redirect URI**, cadastre qualquer URL que você controle ou que apenas exista — ex.: `https://example.com/callback`. Ela só serve para o navegador cair nela com o `code` na barra de endereço.
4. Anote o **Client ID** e o **Client Secret** (credenciais de teste).

### 2. Preparar o ambiente

```bash
cd tools/mp-sandbox
cp .env.example .env
# preencha MP_CLIENT_ID, MP_CLIENT_SECRET e MP_REDIRECT_URI
```

---

## Passo 1 — conectar a conta do guia

```bash
node oauth.mjs url
```

Abra o link **logado na conta do guia** (não na sua — esse é o erro mais comum). Autorize.
O navegador vai para a redirect_uri com `?code=XXXX`. Copie o `code` e rode:

```bash
node oauth.mjs trocar XXXX
```

Copie as três linhas `MP_GUIA_*` que aparecerem para o seu `.env`.

> O `code` vale poucos minutos e só pode ser usado uma vez. Se demorar, gere outro.

---

## Passo 2 — cobrar o sinal com comissão retida

```bash
node split-test.mjs
```

O script imprime a simulação da reserva (R$ 1.000, comissão 10%, sinal 30% — ajustável no `.env`),
cria a cobrança Pix de R$ 300 com `application_fee` de R$ 30, mostra o **Pix copia e cola** e fica
aguardando o pagamento.

Pague o QR com o app do Mercado Pago. Assim que aprovar, o script mostra o resumo.

**Confira nas duas contas:** a conta do guia deve receber ~R$ 270 menos a taxa do Mercado Pago, e a sua
conta deve receber os R$ 30 de comissão.

Guarde o `payment_id` que aparece no fim.

---

## Passo 3 — estorno parcial (política de cancelamento)

```bash
node refund-test.mjs <payment_id> 50
```

Simula um cancelamento com retenção de 50%: devolve metade e retém metade.

**Este é o teste mais importante do kit.** Ele responde a pergunta que decide o desenho do motor de
cancelamento: quando estornamos parte de um pagamento com split, o Mercado Pago tira
proporcionalmente da conta do guia **e** da comissão, ou tira tudo da conta do guia?

- **Se for proporcional:** o motor de cancelamento fica simples — basta mandar o valor a devolver.
- **Se sair tudo do guia:** precisamos calcular e compensar a comissão manualmente, e isso muda a
  implementação da Fase 4.

Anote o resultado real do extrato. É informação que não dá para deduzir da documentação.

---

## Resultado registrado

**Passo 3 — respondido: o estorno parcial debita proporcionalmente da conta do guia e da comissão da
plataforma.** O motor de cancelamento, portanto, só precisa enviar o valor a devolver; não há
compensação manual de comissão. A consequência para o `ledger_entries` está em
`docs/PLANEJAMENTO.md`, na seção "Cancelamento — motor de retenção".

Os scripts continuam úteis como bancada: use-os para reconferir o comportamento com os valores reais
da operação antes de a Fase 4 ir para produção, e sempre que o Mercado Pago mudar algo na API.

## Segurança

- O `.env` está no `.gitignore`. **Nunca** comite tokens.
- Em produção, os tokens do guia ficam **cifrados no banco**, acessíveis apenas pela `service_role`
  nas Edge Functions — nunca expostos ao aplicativo.
- Se um token de teste vazar, revogue a autorização no painel do Mercado Pago e refaça o passo 1.
