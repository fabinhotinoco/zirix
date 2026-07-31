# Plataforma de Pescarias — Planejamento da v1

## Contexto

O projeto começou como o sistema de agendamento de uma única operação (Pesca Vertical) e evoluiu para
uma **plataforma multi-guia**: vários guias de pesca, cada um com sua própria agenda e sua própria
flotilha de barcos, vendendo passeios para os mesmos clientes dentro de um app iOS + Android.

O administrador master (dono da plataforma) ganha **comissão configurável caso a caso sobre toda
transação financeira feita no app**, mais a receita integral das assinaturas **Diamond**. Os guias são
remunerados por passeio e por passageiro, recebendo o valor deles direto na própria conta.

A localização exata das capturas não é pública: é o principal benefício do plano Diamond, que vale para
o feed inteiro da plataforma. O cliente comum vê apenas o nome da região.

O repositório `fabinhotinoco/zirix` está vazio (nenhum commit). Tudo abaixo é construção nova.

### Premissas adotadas (me avise se alguma estiver errada)

Estas quatro decisões ficaram em aberto e eu segui com a opção que considero mais defensável:

| Tema | Premissa adotada | Por quê |
|---|---|---|
| Base da comissão | Incide sobre o **valor total do passeio**, mas é **retida integralmente do sinal** que passa pelo app | Você não depende do guia declarar o saldo recebido em mãos |
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
sinal         = round(valor_liquido × sinal_percentual)     ← pago no app
saldo         = valor_liquido − sinal                        ← pago ao guia no dia
```

**Regra de integridade obrigatória:** `sinal ≥ comissao`. Se um guia configurar sinal de 5% com
comissão de 15%, a comissão não cabe no que passa pelo app. O sistema recusa a configuração no ato,
com mensagem clara — é uma validação, não um erro de tempo de execução.

### Split no pagamento

O sinal é cobrado via **Mercado Pago Marketplace**. O guia conecta a conta dele por OAuth; o pagamento
é criado em nome do guia com `marketplace_fee = comissao_centavos`. O Mercado Pago divide na origem:

```
Sinal R$ 300  →  R$ 100 comissão (sua conta)  +  R$ 200 (conta do guia)
```

Você nunca recebe e repassa. Sua receita tributável é só a comissão, e não há risco de você ficar
devendo repasse a guia nenhum.

**Regra de porta:** guia sem Mercado Pago conectado **não consegue publicar agenda**. Sem isso, existiria
reserva sem caminho de recebimento.

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

## Escopo da v1

**Entra:**
1. Cadastro/login por telefone (OTP via SMS)
2. **Onboarding de guias**: inscrição, aprovação pelo master, conexão do Mercado Pago via OAuth
3. **Flotilha**: cada guia cadastra vários barcos (capacidade, fotos, equipamentos)
4. **Agenda por barco**, com preço por dia (valor do barco + valor por passageiro)
5. Busca de guias e barcos, com agenda visível ao cliente
6. Reserva de dia exclusivo por barco + participantes (nome + telefone)
7. Pagamento do sinal por Pix, crédito ou débito **com split automático e retenção da comissão**
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
18. Política de cancelamento exibida e registrada no ato do pagamento
19. Modo guia e modo master no app + painel web de gestão

**Fica para a v2:** WhatsApp oficial, Diamond por In-App Purchase, pagamento do saldo pelo app, chat
cliente–guia, venda de produtos, split entre participantes, programa de indicação.

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
| `guides` | `id`, `user_id`, `nome_operacao`, `documento`, `cidade`, `bio`, `foto_url`, `status` (`pendente`\|`aprovado`\|`suspenso`), **`comissao_percentual`** (nullable), `sinal_percentual`, `oferece_desconto_diamond`, `desconto_diamond_percentual`, `mp_user_id`, `mp_access_token` (cifrado), `mp_refresh_token`, `mp_conectado_em`, `aprovado_por`, `aprovado_em` |
| `boats` | `id`, `guide_id`, `nome`, `modelo`, `capacidade_min`, `capacidade_max`, `fotos` (jsonb), `equipamentos`, **`comissao_percentual`** (nullable), `status` |
| `boat_availability` | **PK (`boat_id`, `data`)**, `status` (`aberto`\|`bloqueado`), `preco_barco_centavos`, `preco_passageiro_centavos`, `aberto_em`, `observacao` |
| `bookings` | `id`, `codigo`, `user_id`, **`guide_id`**, **`boat_id`**, `data`, `qtd_pescadores`, `preco_barco_centavos`, `preco_passageiro_centavos`, `valor_total_centavos`, `desconto_centavos`, **`comissao_percentual`**, **`comissao_centavos`**, **`repasse_guia_centavos`**, `sinal_centavos`, `saldo_centavos`, `status`, `expira_em`, `confirmada_em`, `cancelada_em`, `termo_versao`, `politica_versao` |
| `booking_participants` | `booking_id`, `nome`, `telefone` |
| `payments` | `id`, `booking_id`, `provider_payment_id`, `metodo`, `valor_centavos`, `marketplace_fee_centavos`, `status`, `payload_bruto` (jsonb) |
| `ledger_entries` | `id`, `tipo` (`comissao_passeio`\|`assinatura_diamond`\|`estorno`\|`outro`), `booking_id?`, `subscription_id?`, `guide_id?`, `valor_bruto_centavos`, `comissao_centavos`, `repasse_centavos`, `status`, `ocorrido_em` |
| `subscriptions` | `id`, `user_id`, `plano` (`diamond`), `inicio`, `fim`, `status`, `valor_centavos`, `origem` (`manual`), `ativado_por` |
| `app_settings` | `chave`, `valor` (jsonb) — comissão padrão, sinal padrão, preço do Diamond, checklist, termo, política |
| `waitlist` | `id`, `user_id`, **`boat_id`**, `data`, `criado_em`, `notificado_em`, `status` |
| `terms_acceptances` | `id`, `user_id`, `booking_id?`, `documento`, `versao`, `ip`, `user_agent`, `aceito_em` |
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
1. Guia se cadastra pelo app informando operação, documento, cidade e contato → `guides.status = pendente`.
2. Master recebe push e aprova no painel, definindo (ou deixando no padrão) a **comissão daquele guia**.
3. Guia conecta o Mercado Pago por OAuth — a plataforma guarda `mp_user_id` e os tokens cifrados.
4. Guia cadastra barcos e abre datas. **Só é possível publicar agenda com o Mercado Pago conectado.**

### 2. Reserva, pagamento e split
1. Cliente escolhe guia → barco → data livre → nº de pescadores → participantes.
2. Edge Function `criar-reserva` **recalcula tudo no servidor**: preço (barco + passageiros), desconto Diamond se o guia oferecer, comissão pela cascata, sinal e saldo. Valida `sinal ≥ comissao`. Cria o `booking` **pendente** — a trava única segura o barco por 20 min.
3. Gera o pagamento no Mercado Pago **em nome do guia**, com `marketplace_fee = comissao_centavos`.
4. Cliente paga (Pix ou cartão). O Mercado Pago chama `mercadopago-webhook`.
5. Webhook (idempotente por `provider_payment_id`) confere o valor, confirma a reserva, gera o código `PV-AAAA-NNNN` e grava o `ledger_entries` da comissão.
6. Notifica cliente (número da reserva, saldo, ponto de encontro) **e o guia** (nova reserva, participantes, quanto recebeu).
7. Sem pagamento em 20 min, a reserva expira e a data volta a ficar livre.

> A confirmação nunca depende do app estar aberto — quem confirma é o webhook.

### 3. Extrato financeiro
- **Guia:** recebimentos por passeio, comissão descontada, saldo a receber em mãos no dia, filtro por período, exportação CSV.
- **Master:** comissão consolidada por período, por guia e por barco; receita de Diamond; ticket médio; taxa de conversão de reserva; datas ociosas por guia.

Como o split acontece na origem, o extrato é **registro do que já aconteceu**, não uma fila de
pagamentos a executar — o que elimina a classe inteira de bugs de repasse.

### 4. Cancelamento e lista de espera
1. Cliente entra na fila de um barco/data ocupado.
2. Cancelamento ou expiração dispara `avisar-lista-espera`: push + SMS por ordem de entrada, Diamond na frente.
3. A data reaparece livre; quem pagar primeiro fecha. A trava única continua sendo a única fonte da verdade.
4. A política vigente decide o destino do sinal, e o app mostra o efeito antes de o cliente confirmar. **Estorno reverte a comissão**, com lançamento negativo no `ledger_entries`.

### 5. Postar captura e visibilidade do local
Foto → remoção de EXIF → marca d'água no dispositivo (`react-native-view-shot`) → upload → `catches` com
coordenada exata → `notificar-captura` (push para todos, e-mail para quem optou). Cliente comum vê foto,
espécie, peso e região; Diamond vê o pino exato, isca, profundidade, horário e clima.

### 6. Ciclo do Diamond
Venda fora do app → master ativa no painel (`fim = inicio + 12 meses`) → cliente é avisado e a área
desbloqueia na hora → avisos automáticos em D-30, D-7 e no vencimento → vencido, o acesso cai sozinho.

---

## Telas

**Cliente:** login · busca de guias e barcos · perfil do guia (barcos, fotos, avaliações) · agenda do
barco · reserva e participantes · pagamento · minhas reservas · feed · postar captura · **Área Diamond**
(mapa de calor, mapa da captura, detalhes técnicos, validade) · perfil.

**Guia:** minha agenda (por barco) · abrir/bloquear datas e preços · meus barcos · reservas e
participantes · check-in do dia · **meu extrato** · avaliações recebidas.

**Master:** aprovação de guias · comissão por guia/barco/reserva · **extrato consolidado** ·
membros Diamond · configurações e textos globais · exportação CSV.

---

## Etapas de implementação

**Fase 0 — Contas e credenciais (você providencia):** conta Mercado Pago **com aplicação Marketplace
criada** (client_id/client_secret para o OAuth dos guias), Twilio ou Zenvia, Resend + domínio, Apple
Developer (US$ 99/ano), Google Play (US$ 25), chave do Google Maps, logo em PNG transparente.

**Fase 1 — Fundação e papéis:** monorepo, Expo, Supabase, schema completo, RLS com `is_master`,
`is_guide_owner` e `is_diamond`, login por telefone, termo versionado com IP.

**Fase 2 — Guias e flotilha:** cadastro do guia, aprovação pelo master, OAuth do Mercado Pago,
CRUD de barcos, agenda por barco com preços.

**Fase 3 — Reserva:** busca de guias/barcos, calendário, `criar-reserva` com cálculo e cascata de
comissão no servidor, participantes, minhas reservas, cancelamento, job de expiração.

**Fase 4 — Pagamento e split:** Mercado Pago Marketplace com `marketplace_fee`, `mercadopago-webhook`
idempotente, `ledger_entries`, política de cancelamento com aceite, reversão de comissão no estorno.

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
- **Estorno de cartão:** o Pix aparece primeiro na tela de pagamento; num chargeback, sua comissão é revertida junto e o `ledger_entries` registra o lançamento negativo.
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
4. **Split (sandbox Mercado Pago):** pagar sinal de R$ 300 com comissão de R$ 100 → conta do guia recebe R$ 200, conta da plataforma R$ 100, `ledger_entries` bate com o extrato do Mercado Pago. Reenviar o webhook manualmente → nada duplica.
5. **Validação sinal ≥ comissão:** guia tenta salvar sinal de 5% com comissão de 15% → recusa no ato, com mensagem clara.
6. **Estorno:** estornar um pagamento → reserva cancelada, comissão revertida e lançamento negativo no `ledger_entries`.
7. **Porta de entrada:** guia aprovado sem Mercado Pago conectado tenta publicar agenda → bloqueado.
8. **Blindagem do Diamond:** com token de cliente comum, chamar o feed por `curl` → `lat`, `lng`, `isca`, `profundidade_m`, `hora_fisgada` e `condicao_tempo` voltam `null`. Baixar a foto do Storage e inspecionar o EXIF → sem GPS. Ler a marca d'água → sem coordenada.
9. **Ciclo da assinatura:** ativar Diamond → área desbloqueia; mudar `fim` para ontem → bloqueia sozinha e os campos voltam a vir nulos.
10. **Lista de espera:** dois clientes na fila (um Diamond) → cancelar → Diamond avisado primeiro, data reaparece livre, quem paga primeiro fecha.
11. **Termo e política:** publicar nova versão do texto e reservar de novo → app pede aceite outra vez, `terms_acceptances` guarda as duas versões com IP e data.
12. **Avaliação e previsão:** forçar o job D+1 → push chega e nota 3 alerta o admin; abrir reserva a 5 dias → previsão aparece; a 20 dias → não aparece e a API não é chamada.
13. **Expiração:** criar reserva e não pagar → após 20 min o barco volta a aparecer livre.
14. **Ponta a ponta em device real:** build EAS de preview num iPhone e num Android, percorrendo cadastro de guia → aprovação → barco → agenda → reserva do cliente → pagamento com split → confirmação → captura → Área Diamond → extrato dos dois lados.

Os testes automatizados da v1 se concentram onde há dinheiro e onde há segredo: testes de integração
das Edge Functions `criar-reserva` e `mercadopago-webhook` (Deno test), testes de cálculo da cascata de
comissão, e testes SQL das políticas RLS rodando com JWT de cliente comum, de Diamond, do guia A e do
guia B — para garantir que nem a coordenada nem os dados de um guia escapem. A UI fica com verificação
manual, para não inflar o tempo da primeira versão.
