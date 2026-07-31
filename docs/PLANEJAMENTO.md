# Plataforma de Pescarias — Planejamento da v1

## Contexto

O projeto começou como o sistema de agendamento de uma única operação (Pesca Vertical) e evoluiu para
uma **plataforma multi-guia**: vários guias de pesca, cada um com sua própria agenda e sua própria
flotilha de barcos, vendendo passeios para os mesmos clientes dentro de um app iOS + Android.

O administrador master (dono da plataforma) ganha **comissão configurável caso a caso sobre toda
transação financeira feita no app**, mais a receita integral das assinaturas **Diamond**. Os guias são
remunerados por passeio e por passageiro, recebendo o valor deles direto na própria conta.

**Todo o dinheiro passa pela plataforma — sinal e quitação.** Não existe pagamento em mãos no dia da
pescaria. Isso faz a comissão incidir sobre 100% do faturamento real, elimina a dependência de o guia
declarar quanto recebeu e dá ao cliente um histórico financeiro completo dentro do app.

A localização exata das capturas não é pública: é o principal benefício do plano Diamond, que vale para
o feed inteiro da plataforma. O cliente comum vê apenas o nome da região.

O repositório `fabinhotinoco/zirix` está vazio (nenhum commit). Tudo abaixo é construção nova.

### Premissas adotadas (me avise se alguma estiver errada)

Estas quatro decisões ficaram em aberto e eu segui com a opção que considero mais defensável:

| Tema | Premissa adotada | Por quê |
|---|---|---|
| Base da comissão | Incide sobre o **valor total do passeio**, rateada proporcionalmente entre sinal e quitação (**decidido: tudo é pago na plataforma**) | Comissão sobre 100% do faturamento, sem depender de declaração de ninguém |
| Repasse ao guia | **Split automático do Mercado Pago** (cada guia conecta a própria conta) | A receita bruta dos guias nunca transita no seu CNPJ — evita um problema fiscal sério |
| Formação de preço | **Valor do barco/dia + valor por passageiro** (qualquer um dos dois pode ser zero) | Cobre os dois modelos citados numa fórmula só |
| Entrada de guias | Guia se cadastra → **você aprova** → ele define barcos, agenda e preços | Escala sem você virar gargalo, mantendo o controle na porta de entrada |

**A definir (valores de negócio; são configuráveis no painel e não bloqueiam o desenvolvimento):**
comissão padrão da plataforma · preço anual do Diamond · percentual do sinal · desconto Diamond ·
dias de antecedência exclusiva na agenda · prazo da política de cancelamento.

---

## Modelo de negócio e fluxo do dinheiro

Três fontes de receita para o administrador master:

1. **Comissão por passeio** — percentual configurável, resolvido em cascata (detalhe abaixo).
2. **Assinatura Diamond** — 100% sua, vendida fora do app e ativada pelo painel.
3. **Comissão sobre qualquer outra venda futura no app** (produtos, iscas, pacotes) — a tabela de
   lançamentos já nasce genérica para suportar isso sem refazer nada.

### Cascata da comissão (o "caso a caso")

```
comissão = coalesce(
  reserva.comissao_percentual_override,   -- negociação pontual de uma reserva
  barco.comissao_percentual,              -- barco específico
  guia.comissao_percentual,               -- acordo com aquele guia
  app_settings.comissao_padrao            -- padrão da plataforma
)
```

O percentual resolvido é **congelado na reserva** no momento da criação (`bookings.comissao_percentual`).
Mudar a comissão de um guia amanhã não pode alterar o valor de uma reserva fechada ontem.

### Cálculo de uma reserva

```
valor_total   = preco_barco + (preco_por_passageiro × qtd_pescadores)
desconto      = desconto Diamond, se o guia oferecer (sai da parte do guia)
valor_liquido = valor_total − desconto
comissao      = round(valor_liquido × comissao_percentual)
sinal         = round(valor_liquido × sinal_percentual)   ← pago no app, trava a data
saldo         = valor_liquido − sinal                      ← pago no app, até o prazo de quitação
```

Como **tudo passa pela plataforma**, não existe mais a restrição de o sinal precisar comportar a
comissão inteira: ela é **rateada proporcionalmente entre as duas cobranças**.

```
fee_do_pagamento = round(comissao × valor_do_pagamento ÷ valor_liquido)
```

A última cobrança absorve o centavo de arredondamento, de modo que a soma das `marketplace_fee`
sempre bate exatamente com `bookings.comissao_centavos`.

O cliente também pode **quitar tudo de uma vez** no ato da reserva; nesse caso há uma cobrança só,
com a comissão inteira.

### Split no pagamento

Cada cobrança passa pelo **Mercado Pago Marketplace**. O guia conecta a conta dele por OAuth; o
pagamento é criado em nome do guia com a comissão daquela cobrança no campo de taxa da plataforma —
que é **`application_fee`** ao usar a API de pagamentos (`POST /v1/payments`, o caminho do Pix) e
`marketplace_fee` ao usar preferências do Checkout Pro. O Mercado Pago divide na origem:

```
Passeio R$ 1.000 · comissão 10% (R$ 100) · sinal 30%

Sinal      R$ 300  →  R$  30 comissão (sua conta)  +  R$ 270 (conta do guia)
Quitação   R$ 700  →  R$  70 comissão (sua conta)  +  R$ 630 (conta do guia)
```

Você nunca recebe e repassa. Sua receita tributável é só a comissão, e não há risco de você ficar
devendo repasse a guia nenhum.

**Contas envolvidas:** a **conta coletora da plataforma já existe** e é a sua — é dentro dela que se
cria a aplicação Marketplace (client_id/client_secret). **Só os guias precisam conectar as contas
deles**, por OAuth, uma única vez no onboarding.

**Prazo de quitação:** `app_settings.prazo_quitacao_dias` (**padrão: 7 dias antes da pescaria**), com
override por guia. O prazo é deliberadamente maior que a última faixa da política de cancelamento:
assim, quando chega a janela em que a retenção é alta, **o dinheiro já está dentro da plataforma** —
é isso que torna a retenção efetiva em vez de teórica. Não pago no prazo, a reserva é cancelada pela
política e a data volta para a lista de espera.

**Regra de porta:** guia sem Mercado Pago conectado **não consegue publicar agenda**. Sem isso, existiria
reserva sem caminho de recebimento.

### Cancelamento — motor de retenção

Faixas configuráveis em `cancellation_rules`, com override por guia, congeladas em
`bookings.politica_versao` no ato da reserva. Escala padrão proposta (dias corridos até a pescaria):

| Antecedência | Retenção |
|---|---|
| ≥ 30 dias | só a taxa administrativa (5%) |
| 15–29 dias | 25% |
| 7–14 dias | 50% |
| 3–6 dias | 75% |
| < 48h ou não comparecimento | 100% |

Três regras tornam essa escala defensável perante o CDC, e as três são obrigatórias:

1. **`retencao = min(retencao_calculada, total_pago)`** — nunca há cobrança adicional após o cancelamento. Cobrar valor não pago é briga cara e de resultado incerto.
2. **Devolução por revenda:** se a data cancelada for fechada por outro grupo, o valor retido é devolvido (menos a taxa administrativa), disparado pelo webhook da nova reserva no mesmo `boat_id` + `data`. É o que amarra a retenção ao prejuízo real, e não à punição.
3. **Arrependimento de 7 dias (art. 49 do CDC)** prevalece sobre a escala, com devolução integral, desde que a pescaria ainda não tenha ocorrido.

Alternativas oferecidas antes do cancelamento — remarcar data (1× sem custo até 15 dias antes),
transferir a reserva para outra pessoa (até 48h antes) e reduzir participantes — reduzem a perda dos
dois lados e reforçam a boa-fé da política.

O valor retido é dividido entre guia e plataforma **na mesma proporção da comissão**.

**Comportamento do estorno parcial — confirmado:** o Mercado Pago debita proporcionalmente da conta do
guia **e** da comissão da plataforma. Isso simplifica bastante o motor de cancelamento: basta enviar o
valor a devolver; **não há compensação manual de comissão a fazer**, e o rateio se mantém sozinho.

Duas consequências que o código precisa refletir:

```
comissao_revertida = round(fee_da_cobranca × valor_estornado ÷ valor_da_cobranca)
comissao_liquida   = fee_da_cobranca − Σ comissoes_revertidas
```

1. O `ledger_entries` do estorno registra **apenas a comissão proporcional revertida**, não a comissão inteira. Estorno de metade devolve metade da comissão.
2. **Reembolso integral zera a comissão daquela reserva** — é o que acontece no arrependimento de 7 dias. Correto e esperado: sem serviço prestado, não há intermediação a remunerar.

A devolução por revenda da data (cláusula 2.2 da política) é um **segundo estorno parcial sobre o mesmo
pagamento** e segue a mesma regra proporcional, sem tratamento especial.

---

## Papéis e permissões

| Papel | Pode |
|---|---|
| `master` | Aprovar/suspender guias, definir comissão por guia/barco/reserva, ver extrato consolidado de toda a plataforma, gerenciar Diamond, editar textos e configurações globais |
| `guia` | Gerenciar seus barcos, sua agenda e seus preços; ver suas reservas, participantes e extrato; fazer check-in; **nunca** vê dados de outro guia |
| `cliente` | Buscar guias e barcos, reservar, pagar, cadastrar participantes, postar capturas, acessar a Área Diamond se for membro |

O isolamento entre guias é o ponto mais sensível de segurança da plataforma e é resolvido no banco por
RLS, com a função `is_guide_owner(guide_id)` — nunca por filtro na tela.

---

## Documentos legais e registro de aceite

Cinco documentos versionados, guardados em `legal_documents` e editáveis no painel sem nova versão do
app. As minutas já estão escritas em `docs/legal/`:

| Documento | Quem aceita | Quando |
|---|---|---|
| **Contrato de Adesão — Guia** (`contrato-adesao-guia.md`) | guia | no cadastro |
| **Termos de Uso — Pescador** (`contrato-uso-cliente.md`) | cliente | no cadastro |
| **Política de Cancelamento** (`politica-cancelamento.md`) | cliente | na tela de pagamento, a cada reserva |
| **Termo de Responsabilidade** | cliente | a cada reserva |
| **Política de Privacidade** | ambos | no cadastro |

**Como o aceite é coletado — cinco regras que decidem se ele vale como prova:**

1. **Checkbox desmarcado por padrão.** Aceite pré-marcado não é manifestação de vontade; é vício. O botão de continuar fica desabilitado até o usuário marcar.
2. **Um checkbox por documento**, cada um com link para ler o texto completo dentro do app. Nada de "aceito os termos e a política e o contrato" numa linha só.
3. **Cláusulas limitativas em destaque** no texto (art. 54, §4º do CDC) — retenção escalonada, riscos da atividade, limitação de responsabilidade, não circunvenção.
4. **Registro com `hash_sha256` do corpo do documento**, além de versão, IP, user-agent e timestamp. O hash é o que permite provar, meses depois, **exatamente qual texto** a pessoa aceitou — versão sozinha não prova, porque o corpo pode ter sido editado.
5. **Nova versão exige novo aceite.** Publicado um texto novo, o app pede o aceite no próximo acesso; reservas já confirmadas permanecem regidas pela versão aceita à época.

**Estas minutas precisam de revisão por advogado antes de ir para produção.** Escrevi como ponto de
partida técnico, com os campos a preencher marcados entre colchetes. A peça de maior risco é a Política
de Cancelamento, por tratar de retenção de valores em relação de consumo.

---

## Escopo da v1

**Entra:**
1. Cadastro/login por telefone (OTP via SMS)
2. **Onboarding de guias**: inscrição, aprovação pelo master, conexão do Mercado Pago via OAuth
3. **Flotilha**: cada guia cadastra vários barcos (capacidade, fotos, equipamentos)
4. **Agenda por barco**, com preço por dia (valor do barco + valor por passageiro)
5. Busca de guias e barcos, com agenda visível ao cliente
6. Reserva de dia exclusivo por barco + participantes (nome + telefone)
7. **Pagamento integral pela plataforma** — sinal e quitação por Pix, crédito ou débito, com split automático e comissão rateada entre as cobranças
8. Confirmação automática: número da reserva por SMS, e-mail e push
9. **Extrato financeiro**: consolidado da plataforma para o master, individual para cada guia
10. Lembretes automáticos D-3 e D-1 com checklist
11. Feed de capturas: foto com marca d'água + espécie/peso + **nome da região**
12. **Plano Diamond**: assinatura anual ativada pelo painel, com Área Diamond (localização exata, mapa de calor, agenda antecipada, desconto, detalhes técnicos)
13. Lista de espera para datas ocupadas
14. Previsão do tempo do dia da pescaria
15. Termo de responsabilidade aceito no app, com data e IP
16. Ranking mensal do maior peixe
17. Avaliação pós-pescaria em D+1
18. **Documentos legais versionados com aceite registrado** — contrato de adesão do guia, termos do pescador, política de cancelamento, termo de responsabilidade e política de privacidade
19. **Motor de cancelamento com retenção escalonada**, devolução por revenda, remarcação e transferência de titular
20. Modo guia e modo master no app + painel web de gestão

**Fica para a v2:** WhatsApp oficial, Diamond por In-App Purchase, chat cliente–guia, venda de
produtos, divisão do pagamento entre os participantes, programa de indicação.

---

## Arquitetura

```
zirix/
  apps/mobile/        # Expo (React Native + TypeScript) — cliente, guia e master
  apps/admin/         # Next.js — painel web (master e guias)
  supabase/
    migrations/       # schema SQL + RLS
    functions/        # Edge Functions (Deno)
  docs/
```

| Camada | Escolha | Por quê |
|---|---|---|
| App | Expo SDK + expo-router + TypeScript | um código para iOS/Android, build via EAS, atualização OTA sem passar pela loja |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | banco, login, fotos e webhooks num só lugar; RLS resolve o isolamento entre guias |
| Pagamento | **Mercado Pago Marketplace** (OAuth + `marketplace_fee`) | Pix e cartão com split na origem e comissão retida automaticamente |
| SMS | Twilio (ou Zenvia, mais barato no BR) | mesmo provedor para OTP de login e avisos |
| E-mail | Resend | API simples, domínio próprio |
| Push | Expo Push Notifications | grátis, iOS e Android |
| Mapa | `react-native-maps` | mapa de calor e pino do ponto na Área Diamond |
| Painel web | Next.js na Vercel | mesmo Supabase, deploy grátis |

**Regras das lojas (crítico):**
- Passeio de pesca é serviço do mundo real → pagar pelo Mercado Pago dentro do app é **permitido**, e a sua comissão sobre ele também (Guideline 3.1.3(e) da Apple).
- Assinatura Diamond desbloqueia conteúdo digital → como será **vendida fora do app** e ativada pelo painel, o app **não pode ter botão de compra, preço com chamada para ação, nem link para pagar**. A Área Diamond, para não-membros, é informativa.

---

## Modelo de dados (`supabase/migrations/0001_init.sql`)

| Tabela | Campos principais |
|---|---|
| `profiles` | `id`(=auth.uid), `nome`, `telefone`, `email`, `avatar_url`, `role` (`master`\|`guia`\|`cliente`) |
| `guides` | `id`, `user_id`, `nome_operacao`, `documento`, `cidade`, `bio`, `foto_url`, `status` (`pendente`\|`aprovado`\|`suspenso`), **`comissao_percentual`** (nullable), `sinal_percentual`, `prazo_quitacao_dias`, `oferece_desconto_diamond`, `desconto_diamond_percentual`, `mp_user_id`, `mp_access_token` (cifrado), `mp_refresh_token`, `mp_conectado_em`, `aprovado_por`, `aprovado_em` |
| `boats` | `id`, `guide_id`, `nome`, `modelo`, `capacidade_min`, `capacidade_max`, `fotos` (jsonb), `equipamentos`, **`comissao_percentual`** (nullable), `status` |
| `boat_availability` | **PK (`boat_id`, `data`)**, `status` (`aberto`\|`bloqueado`), `preco_barco_centavos`, `preco_passageiro_centavos`, `aberto_em`, `observacao` |
| `bookings` | `id`, `codigo`, `user_id`, **`guide_id`**, **`boat_id`**, `data`, `qtd_pescadores`, `preco_barco_centavos`, `preco_passageiro_centavos`, `valor_total_centavos`, `desconto_centavos`, **`comissao_percentual`**, **`comissao_centavos`**, **`repasse_guia_centavos`**, `sinal_centavos`, `saldo_centavos`, `status`, **`status_pagamento`** (`aguardando_sinal`\|`sinal_pago`\|`quitada`), **`quitacao_vence_em`**, `quitada_em`, `expira_em`, `confirmada_em`, `cancelada_em`, `termo_versao`, `politica_versao` |
| `booking_participants` | `booking_id`, `nome`, `telefone` |
| `payments` | `id`, `booking_id`, **`tipo`** (`sinal`\|`saldo`\|`integral`), `provider_payment_id`, `metodo`, `valor_centavos`, `marketplace_fee_centavos`, `status`, `vence_em`, `payload_bruto` (jsonb) |
| `ledger_entries` | `id`, `tipo` (`comissao_passeio`\|`assinatura_diamond`\|`estorno`\|`outro`), `booking_id?`, `subscription_id?`, `guide_id?`, `valor_bruto_centavos`, `comissao_centavos`, `repasse_centavos`, `status`, `ocorrido_em` |
| `subscriptions` | `id`, `user_id`, `plano` (`diamond`), `inicio`, `fim`, `status`, `valor_centavos`, `origem` (`manual`), `ativado_por` |
| `app_settings` | `chave`, `valor` (jsonb) — comissão padrão, sinal padrão, preço do Diamond, checklist, termo, política |
| `waitlist` | `id`, `user_id`, **`boat_id`**, `data`, `criado_em`, `notificado_em`, `status` |
| `legal_documents` | `id`, `slug` (`contrato_guia`\|`contrato_cliente`\|`termo_responsabilidade`\|`politica_cancelamento`\|`politica_privacidade`), `versao`, `titulo`, `corpo_markdown`, **`hash_sha256`**, `vigente_desde`, `publicado_por` |
| `terms_acceptances` | `id`, `user_id`, `booking_id?`, `documento_slug`, `versao`, **`hash_sha256`**, `ip`, `user_agent`, `aceito_em` |
| `cancellation_rules` | `id`, `guide_id?` (null = padrão da plataforma), `dias_min`, `dias_max`, `retencao_percentual`, `ordem`, `vigente_desde` |
| `reviews` | `booking_id` (PK), `user_id`, `guide_id`, `nota` (1–5), `comentario`, `criado_em` |
| `catches` | `id`, `user_id`, `booking_id?`, `guide_id?`, `foto_path`, `especie`, `peso_kg`, `comprimento_cm`, **`lat`**, **`lng`**, `regiao_nome`, **`isca`**, **`profundidade_m`**, **`hora_fisgada`**, **`condicao_tempo`**, `capturado_em` |
| `catch_likes` | `catch_id`, `user_id` |
| `devices` | `user_id`, `expo_push_token`, `plataforma` |
| `notification_log` | `destino`, `canal`, `template`, `status`, `erro`, `enviado_em` |

Campos em **negrito** em `catches` são exclusivos do Diamond e nunca saem do servidor para um cliente comum.

### Trava anti-conflito — agora por barco

```sql
create unique index bookings_barco_data_ativa
  on bookings (boat_id, data) where status in ('pendente','confirmada');
```

Dois clientes não conseguem fechar o mesmo barco no mesmo dia, mesmo clicando ao mesmo tempo. Barcos
diferentes do mesmo guia seguem independentes. Reserva `pendente` expira em 20 minutos (`pg_cron`).

### Isolamento entre guias

```sql
create function is_guide_owner(g uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from guides where id = g and user_id = auth.uid());
$$;
```

Toda tabela com `guide_id` recebe política `using (is_guide_owner(guide_id) or is_master())`. Um guia
que chame a API direto por `curl` com o próprio token não enxerga nem uma linha de outro guia.

### Controle de acesso Diamond

```sql
create function is_diamond(uid uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from subscriptions
    where user_id = uid and plano = 'diamond'
      and status = 'ativa' and fim >= current_date
  );
$$;
```

A tabela `catches` não é lida diretamente pelo cliente. O feed lê uma view que anula os campos sensíveis:

```sql
create view v_catches_feed with (security_invoker = true) as
select
  c.id, c.user_id, c.guide_id, c.foto_path, c.especie, c.peso_kg,
  c.comprimento_cm, c.regiao_nome, c.capturado_em,
  case when is_diamond(auth.uid()) then c.lat end            as lat,
  case when is_diamond(auth.uid()) then c.lng end            as lng,
  case when is_diamond(auth.uid()) then c.isca end           as isca,
  case when is_diamond(auth.uid()) then c.profundidade_m end as profundidade_m,
  case when is_diamond(auth.uid()) then c.hora_fisgada end   as hora_fisgada,
  case when is_diamond(auth.uid()) then c.condicao_tempo end as condicao_tempo
from catches c;
```

Vencida a assinatura, o acesso cai sozinho — sem job e sem intervenção manual.

**Duas armadilhas que o código precisa evitar:**
1. **A marca d'água não pode conter a coordenada** — ela é gravada na imagem e fica igual para todos. A marca leva logo + espécie + peso + data + **região**.
2. **O EXIF da foto precisa ser removido no upload** — foto de celular carrega o GPS nos metadados; sem limpar, qualquer cliente baixa a imagem e lê o ponto. O `expo-image-manipulator` recodifica e descarta o EXIF. Obrigatório, não opcional.

---

## Fluxos principais

### 1. Onboarding do guia
1. Guia se cadastra pelo app informando operação, documento, cidade e contato, e **marca os checkboxes do Contrato de Adesão e da Política de Privacidade** → `guides.status = pendente`, aceites gravados com hash, versão, IP e user-agent.
2. Master recebe push e aprova no painel, definindo (ou deixando no padrão) a **comissão daquele guia**.
3. Guia conecta o Mercado Pago por OAuth — a plataforma guarda `mp_user_id` e os tokens cifrados.
4. Guia cadastra barcos e abre datas. **Só é possível publicar agenda com o Mercado Pago conectado.**

### 2. Reserva, sinal e split
1. Cliente escolhe guia → barco → data livre → nº de pescadores → participantes.
2. Cliente decide entre **pagar o sinal** ou **quitar tudo agora**.
3. Edge Function `criar-reserva` **recalcula tudo no servidor**: preço (barco + passageiros), desconto Diamond se o guia oferecer, comissão pela cascata, sinal, saldo e `quitacao_vence_em`. Cria o `booking` **pendente** — a trava única segura o barco por 20 min.
4. Gera a cobrança no Mercado Pago **em nome do guia**, com `marketplace_fee` = fatia da comissão daquela cobrança.
5. Cliente paga (Pix ou cartão). O Mercado Pago chama `mercadopago-webhook`.
6. Webhook (idempotente por `provider_payment_id`) confere o valor, confirma a reserva, gera o código `PV-AAAA-NNNN`, atualiza `status_pagamento` e grava o `ledger_entries` da comissão daquela parcela.
7. Notifica cliente (número da reserva, **saldo e data limite de quitação**, ponto de encontro) **e o guia** (nova reserva, participantes, quanto recebeu).
8. Sem pagamento em 20 min, a reserva expira e a data volta a ficar livre.

> A confirmação nunca depende do app estar aberto — quem confirma é o webhook.

### 3. Quitação do saldo
1. A reserva confirmada mostra o saldo em aberto e a data limite (`quitacao_vence_em`, padrão 3 dias antes da pescaria).
2. Lembretes automáticos em D-10, D-5 e no dia do vencimento, por push, SMS e e-mail.
3. Cliente paga pelo app → nova cobrança com `marketplace_fee` da fatia restante → webhook marca `status_pagamento = quitada` e grava o segundo `ledger_entries`.
4. **Vencido sem pagamento:** a reserva entra em alerta no painel do guia e do master. Passado o prazo, a política vigente decide — o padrão é cancelar, reter o sinal e disparar a lista de espera. A regra é executada por job, nunca manualmente.
5. **O check-in do guia mostra o status de pagamento.** Nenhum embarque de reserva não quitada acontece por descuido: a tela do dia lista quem está quitado e quem não está.

> A soma das `marketplace_fee` das cobranças de uma reserva sempre bate com `bookings.comissao_centavos` — é uma invariante testada, não uma expectativa.

### 4. Extrato financeiro
- **Guia:** recebimentos por passeio (sinal e quitação separados), comissão descontada, reservas com saldo em aberto e respectivos vencimentos, filtro por período, exportação CSV.
- **Master:** comissão consolidada por período, por guia e por barco; receita de Diamond; ticket médio; taxa de conversão de reserva; datas ociosas por guia.

Como o split acontece na origem, o extrato é **registro do que já aconteceu**, não uma fila de
pagamentos a executar — o que elimina a classe inteira de bugs de repasse.

### 5. Cancelamento, retenção e lista de espera
1. Cliente pede cancelamento. O app **calcula no servidor** a faixa aplicável e mostra, antes de confirmar, o valor exato do reembolso — junto com as alternativas (remarcar, transferir, reduzir participantes).
2. Confirmado, o estorno parcial é enviado ao Mercado Pago. Como o pagamento era dividido, o estorno já sai proporcionalmente da conta do guia e da comissão; o `ledger_entries` recebe o lançamento negativo.
3. Cancelamento ou expiração dispara `avisar-lista-espera`: push + SMS por ordem de entrada, Diamond na frente.
4. A data reaparece livre; quem pagar primeiro fecha. A trava única continua sendo a única fonte da verdade.
5. **Se a data for revendida**, o webhook da nova reserva dispara a devolução do valor retido ao cliente que cancelou, descontada a taxa administrativa — a regra que sustenta juridicamente a escala de retenção.
6. Cancelamento por guia, clima ou autoridade → reembolso integral sem retenção, e a penalidade contratual do guia é registrada.

### 6. Postar captura e visibilidade do local
Foto → remoção de EXIF → marca d'água no dispositivo (`react-native-view-shot`) → upload → `catches` com
coordenada exata → `notificar-captura` (push para todos, e-mail para quem optou). Cliente comum vê foto,
espécie, peso e região; Diamond vê o pino exato, isca, profundidade, horário e clima.

### 7. Ciclo do Diamond
Venda fora do app → master ativa no painel (`fim = inicio + 12 meses`) → cliente é avisado e a área
desbloqueia na hora → avisos automáticos em D-30, D-7 e no vencimento → vencido, o acesso cai sozinho.

---

## Telas

**Cliente:** login · busca de guias e barcos · perfil do guia (barcos, fotos, avaliações) · agenda do
barco · reserva e participantes · pagamento (sinal ou integral) · minhas reservas **com saldo em aberto
e botão de quitar** · feed · postar captura · **Área Diamond**
(mapa de calor, mapa da captura, detalhes técnicos, validade) · perfil.

**Guia:** minha agenda (por barco) · abrir/bloquear datas e preços · meus barcos · reservas e
participantes · **check-in do dia com status de pagamento** · saldos em aberto e vencimentos ·
**meu extrato** · avaliações recebidas.

**Master:** aprovação de guias · comissão por guia/barco/reserva · **extrato consolidado** ·
membros Diamond · configurações e textos globais · exportação CSV.

---

## Etapas de implementação

**Fase 0 — Contas e credenciais (você providencia):** **aplicação Marketplace criada dentro da sua
conta Mercado Pago existente** (client_id/client_secret para o OAuth dos guias — só os guias conectam
conta, a coletora é a sua), Twilio ou Zenvia, Resend + domínio, Apple Developer (US$ 99/ano), Google
Play (US$ 25), chave do Google Maps, logo em PNG transparente, **minutas legais revisadas por
advogado** e os campos entre colchetes preenchidos.

**Fase 1 — Fundação, papéis e documentos legais:** monorepo, Expo, Supabase, schema completo, RLS com
`is_master`, `is_guide_owner` e `is_diamond`, login por telefone, `legal_documents` com versionamento e
hash, **telas de cadastro com checkboxes separados** e `terms_acceptances`.

**Fase 2 — Guias e flotilha:** cadastro do guia, aprovação pelo master, OAuth do Mercado Pago,
CRUD de barcos, agenda por barco com preços.

**Fase 3 — Reserva:** busca de guias/barcos, calendário, `criar-reserva` com cálculo e cascata de
comissão no servidor, participantes, minhas reservas, cancelamento, job de expiração.

**Fase 4 — Pagamento, split e cancelamento:** Mercado Pago Marketplace com `marketplace_fee` rateada,
`mercadopago-webhook` idempotente, cobrança de quitação com prazo, lembretes e job de vencimento,
`ledger_entries`, **motor de retenção (`cancellation_rules`, estorno parcial, devolução por revenda,
arrependimento de 7 dias, remarcação e transferência de titular)**, reversão de comissão no estorno.

**Fase 5 — Extratos:** painel do guia e consolidado do master, filtros por período e exportação.

**Fase 6 — Notificações:** `enviar-notificacao` (SMS/e-mail/push), avisos ao guia, lembretes D-3/D-1
com checklist e ponto de encontro, `notification_log`.

**Fase 7 — Feed de capturas:** foto + GPS, remoção de EXIF, marca d'água, feed, ranking mensal.

**Fase 8 — Diamond:** `subscriptions`, view `v_catches_feed`, Área Diamond com mapa de calor, agenda
antecipada, desconto, avisos de vencimento, gestão de membros.

**Fase 9 — Retenção:** lista de espera, previsão do tempo (Open-Meteo com cache), avaliação em D+1 com
alerta de nota baixa.

**Fase 10 — Publicação:** build EAS, TestFlight + Play Internal Testing, política de privacidade,
ícones/splash, submissão às lojas.

---

## Funcionalidades complementares (confirmadas)

**Lista de espera.** `waitlist` + trigger de cancelamento → `avisar-lista-espera` (push + SMS, Diamond
primeiro). Um dos poucos casos em que o SMS se paga: a janela de decisão é curta.

**Previsão do tempo.** Open-Meteo, gratuita e sem chave. Coordenadas de operação por guia. Exibida a
partir de D-7 e embutida no lembrete D-1. Edge Function com cache de 1 hora.

**Checklist no lembrete.** Configurável **por guia** (`guides` + `app_settings` como padrão), editável
no painel sem nova versão do app. D-3 traz o que levar; D-1 traz ponto, horário e previsão.

**Termo de responsabilidade.** Versionado e registrado em `terms_acceptances` com versão, IP e
user-agent. Aceito no cadastro e **reconfirmado a cada reserva** — é o aceite por pescaria que tem valor
probatório. Mudou o texto, o app pede aceite de novo.

**Ranking mensal do maior peixe.** View `v_ranking_mensal` sobre `catches`, global e por guia. Anúncio
automático do vencedor por push no primeiro dia do mês.

**Avaliação pós-pescaria.** Job em D+1 com deep link para nota (1–5) + comentário. Média por guia
aparece no perfil dele e no painel do master. Nota ≤ 3 gera alerta imediato.

**Política de cancelamento.** Versionada, com aceite obrigatório na tela de pagamento e registro em
`bookings.politica_versao`. O app mostra o efeito real antes de confirmar o cancelamento.

---

## Riscos e pontos de atenção

- **O escopo praticamente dobrou.** Virar marketplace acrescenta onboarding de guias, isolamento de dados, split de pagamento, extratos e um terceiro perfil de usuário. A estimativa passa de ~7–9 semanas para **~13 a 16 semanas**. Se quiser encurtar: construa o modelo de dados multi-guia desde já (é barato agora, caríssimo depois) e **lance com a Pesca Vertical como primeiro guia**, abrindo o cadastro para outros guias 4 a 6 semanas depois. Você valida o produto com dinheiro real antes de depender de terceiros.
- **Vazamento entre guias.** É o pior defeito possível numa plataforma como essa — um guia ver a carteira de clientes ou o faturamento do outro. Por isso a regra vive em RLS no banco, e o plano de verificação testa isso explicitamente com token real.
- **Situação fiscal de intermediador.** Com o split, sua receita tributável é só a comissão, e cada guia responde pela dele. Mesmo assim, você passa a emitir nota de serviço de intermediação e a plataforma tem obrigações de marketplace perante o consumidor (CDC). Vale uma conversa com contador antes de abrir para guias de fora — é decisão de negócio, não de software, mas o software precisa gerar os relatórios que o contador vai pedir, e o `ledger_entries` existe para isso.
- **Quem banca o desconto Diamond.** Adotei que o desconto sai da parte do guia, e que oferecê-lo é opcional para ele. O contrário faria você subsidiar venda alheia com dinheiro próprio.
- **Rejeição na App Store por causa do Diamond.** Enquanto a assinatura for vendida fora do app, o aplicativo não pode ter botão de compra, preço com CTA nem link de pagamento. Levar o Diamond para dentro do app exige In-App Purchase (~15%) — planejado para a v2.
- **Tokens do Mercado Pago dos guias** são credenciais de terceiros. Ficam cifrados, acessíveis só pela `service_role` nas Edge Functions, nunca expostos ao app.
- **Inadimplência do saldo.** Com tudo passando pela plataforma, surge um risco que antes não existia: o cliente paga o sinal e some. Por isso a quitação tem prazo (padrão: 3 dias antes), lembretes em D-10, D-5 e no vencimento, alerta no painel do guia e um job que aplica a política automaticamente — cancelar, reter o sinal e devolver a data para a lista de espera. A data não pode ficar bloqueada por uma reserva que não vai acontecer.
- **A política de cancelamento é a peça de maior risco jurídico do app.** Retenção de valor em relação de consumo é terreno onde cláusula mal redigida é anulada e a plataforma devolve tudo, com custas. As três salvaguardas — teto no valor pago, devolução por revenda e arrependimento de 7 dias — existem para amarrar a retenção ao prejuízo real, que é o que a torna defensável. **Nenhuma das minutas em `docs/legal/` deve ir para produção sem revisão de advogado.**
- **Exposição a estorno aumentou.** Antes só o sinal passava pelo app; agora é o valor cheio, e um chargeback pode vir semanas depois de o guia já ter recebido a parte dele. O Pix aparece primeiro na tela de pagamento justamente por isso. Num estorno, sua comissão é revertida junto e o `ledger_entries` registra o lançamento negativo — mas o acerto com o guia sobre a parte dele é contratual, não automático. Vale estar no contrato de adesão do guia.
- **Recebimento do guia:** cartão parcelado no Mercado Pago libera conforme a política da conta dele, não no ato. O guia precisa entender que "reserva quitada" não é o mesmo que "dinheiro disponível" — o extrato mostra as duas coisas separadas para evitar essa confusão.
- **LGPD:** participantes são terceiros cadastrados por outra pessoa — aviso de autorização, registro do aceite e exclusão de dados. Alertas de captura exigem opt-in separado.
- **Custo de SMS** (~R$ 0,08–0,15): confirmação, lembretes, lista de espera e vencimento do Diamond, sim. Alerta de captura, não — só push e e-mail.
- **Aprovação nas lojas:** ~1 a 2 semanas na primeira submissão da Apple.

---

## Custo mensal estimado

Supabase Pro (US$ 25, recomendado a partir do momento em que houver dinheiro de terceiros no sistema) ·
Vercel Free · Expo/EAS Free–US$ 19 · Resend Free (3k e-mails) · SMS por uso (~R$ 30–120/mês) ·
Google Maps dentro da cota gratuita nesse volume · Mercado Pago por transação (Pix ~0,99%, crédito
~4,98%, sem custo adicional pelo split) · Lojas: US$ 99/ano + US$ 25 uma vez.
**Base fixa: ~R$ 150 a R$ 400/mês**, independente do número de guias.

---

## Verificação

1. **Conflito de agenda:** dois dispositivos reservam o mesmo barco/data ao mesmo tempo → um recebe erro claro, o banco tem 1 registro ativo. Repetir com **barcos diferentes do mesmo guia** → ambas as reservas passam.
2. **Isolamento entre guias (o teste mais importante da plataforma):** com o token do guia A, chamar a API direto por `curl` tentando ler `bookings`, `boats`, `ledger_entries` e clientes do guia B → zero linhas em todos os casos.
3. **Cascata da comissão:** definir padrão 10%, guia 12%, barco 15% e override de reserva 8% → cada nível vence o anterior. Depois alterar a comissão do guia e reabrir uma reserva antiga → o valor histórico não muda.
4. **Split das duas cobranças (sandbox Mercado Pago):** passeio de R$ 1.000 com comissão de 10% e sinal de 30% → sinal divide R$ 30/R$ 270, quitação divide R$ 70/R$ 630; a soma das `marketplace_fee` bate exatamente com `bookings.comissao_centavos` e o `ledger_entries` bate com o extrato do Mercado Pago. Reenviar qualquer um dos webhooks manualmente → nada duplica.
5. **Arredondamento:** repetir o teste acima com valor que não divide redondo (ex.: R$ 999,99 com comissão de 7%) → soma das fatias continua batendo ao centavo com a comissão total.
6. **Quitação integral no ato:** reservar escolhendo "pagar tudo agora" → uma única cobrança, comissão inteira, `status_pagamento = quitada` direto.
7. **Vencimento do saldo:** criar reserva, pagar só o sinal e forçar a passagem do prazo → lembretes disparam nas datas certas, o alerta aparece no painel do guia e o job aplica a política (cancela, retém o sinal, dispara a lista de espera).
8. **Check-in:** tela do dia do guia mostra corretamente quem está quitado e quem não está.
9. **Estorno:** estornar um pagamento → reserva cancelada e lançamento negativo no `ledger_entries` com a **comissão proporcional** ao valor devolvido (estorno de metade reverte metade da comissão; estorno integral zera). Conferir contra o extrato das duas contas do Mercado Pago.
9.1. **Escala de retenção:** cancelar a mesma reserva a 40, 20, 10, 4 e 1 dia da data → reembolso bate com cada faixa; com apenas o sinal pago, a retenção é limitada ao sinal e nunca gera cobrança adicional.
9.2. **Devolução por revenda:** cancelar dentro de uma faixa com retenção, depois fechar a mesma data e o mesmo barco com outro cliente → o primeiro recebe de volta o valor retido menos a taxa administrativa, automaticamente.
9.3. **Arrependimento:** cancelar em até 7 dias da reserva, com a pescaria ainda no futuro → devolução integral, inclusive da taxa administrativa, ignorando a escala.
9.4. **Aceites:** checkbox nunca vem marcado; o botão só habilita com todos marcados; `terms_acceptances` grava versão, hash, IP e user-agent. Publicar nova versão do documento → o app pede aceite de novo no próximo acesso e a reserva antiga mantém a versão antiga.
10. **Porta de entrada:** guia aprovado sem Mercado Pago conectado tenta publicar agenda → bloqueado.
11. **Blindagem do Diamond:** com token de cliente comum, chamar o feed por `curl` → `lat`, `lng`, `isca`, `profundidade_m`, `hora_fisgada` e `condicao_tempo` voltam `null`. Baixar a foto do Storage e inspecionar o EXIF → sem GPS. Ler a marca d'água → sem coordenada.
12. **Ciclo da assinatura:** ativar Diamond → área desbloqueia; mudar `fim` para ontem → bloqueia sozinha e os campos voltam a vir nulos.
13. **Lista de espera:** dois clientes na fila (um Diamond) → cancelar → Diamond avisado primeiro, data reaparece livre, quem paga primeiro fecha.
14. **Termo e política:** publicar nova versão do texto e reservar de novo → app pede aceite outra vez, `terms_acceptances` guarda as duas versões com IP e data.
15. **Avaliação e previsão:** forçar o job D+1 → push chega e nota 3 alerta o admin; abrir reserva a 5 dias → previsão aparece; a 20 dias → não aparece e a API não é chamada.
16. **Expiração:** criar reserva e não pagar → após 20 min o barco volta a aparecer livre.
17. **Ponta a ponta em device real:** build EAS de preview num iPhone e num Android, percorrendo cadastro de guia → aprovação → barco → agenda → reserva do cliente → pagamento com split → confirmação → captura → Área Diamond → extrato dos dois lados.

Os testes automatizados da v1 se concentram onde há dinheiro e onde há segredo: testes de integração
das Edge Functions `criar-reserva` e `mercadopago-webhook` (Deno test), testes de cálculo da cascata de
comissão, e testes SQL das políticas RLS rodando com JWT de cliente comum, de Diamond, do guia A e do
guia B — para garantir que nem a coordenada nem os dados de um guia escapem. A UI fica com verificação
manual, para não inflar o tempo da primeira versão.
