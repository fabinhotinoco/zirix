# Pesca Vertical — App de Agendamento de Pescarias (v1)

## Contexto

A Pesca Vertical hoje organiza suas pescarias fora de um sistema (WhatsApp/agenda manual), o que gera
risco de data duplicada, cobrança solta e cadastro de participantes espalhado. O objetivo desta v1 é um
app iOS + Android onde o cliente vê a agenda real, reserva um **dia inteiro exclusivo** para sua equipe,
paga um **sinal** que trava a data automaticamente, recebe confirmação com número de reserva, e onde
todos os pescadores cadastrados acompanham um feed de capturas com foto marcada e localização.

O repositório `fabinhotinoco/zirix` está vazio (nenhum commit). Tudo abaixo é construção nova.

**Decisões já fechadas com o cliente:** dia inteiro exclusivo · sinal + saldo no dia · React Native
(Expo) + Supabase · Mercado Pago · SMS/e-mail/push na v1 (WhatsApp na v2) · GPS exato no feed ·
admin no app **e** painel web.

---

## Escopo da v1

**Entra:**
1. Cadastro/login por telefone (OTP via SMS)
2. Agenda em calendário com dias livres/ocupados/bloqueados e preço por dia
3. Reserva de dia exclusivo + cadastro dos participantes (nome + telefone)
4. Pagamento do sinal por Pix, crédito ou débito (Mercado Pago)
5. Confirmação automática: número da reserva por SMS, e-mail e push
6. Lembretes automáticos D-3 e D-1
7. Feed de capturas: foto com marca d'água do app + espécie/peso + GPS, com alerta para todos
8. Modo administrador no app + painel web de gestão

**Fica para a v2 (proposital, para a v1 sair rápido):** WhatsApp oficial, pagamento do saldo pelo app,
chat interno, split de pagamento entre participantes, programa de indicação.

---

## Arquitetura

Monorepo simples:

```
zirix/
  apps/mobile/        # Expo (React Native + TypeScript) — app do cliente e modo admin
  apps/admin/         # Next.js — painel web da Pesca Vertical
  supabase/
    migrations/       # schema SQL + RLS
    functions/        # Edge Functions (Deno)
  docs/
```

| Camada | Escolha | Por quê |
|---|---|---|
| App | Expo SDK + expo-router + TypeScript | um código para iOS/Android, build na nuvem via EAS, OTA update sem passar pela loja |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | banco, login por telefone, armazenamento de fotos e webhooks num só lugar |
| Pagamento | Mercado Pago Checkout API | Pix instantâneo + crédito/débito, webhook de confirmação |
| SMS | Twilio (ou Zenvia, mais barato no BR) | usado tanto no OTP de login quanto na confirmação — um provedor só |
| E-mail | Resend | API simples, domínio próprio |
| Push | Expo Push Notifications | grátis, funciona em iOS e Android |
| Painel web | Next.js na Vercel | mesmo Supabase, deploy grátis |

**Nota Apple:** pescaria é serviço do mundo real, então está **isenta** da compra in-app obrigatória
(App Store Guideline 3.1.3(e)) — pagar por Mercado Pago dentro do app é permitido.

---

## Modelo de dados (`supabase/migrations/0001_init.sql`)

| Tabela | Campos principais |
|---|---|
| `profiles` | `id`(=auth.uid), `nome`, `telefone`, `email`, `avatar_url`, `role` (`cliente`\|`admin`), `aceite_termos_at` |
| `availability_days` | `data` (PK), `status` (`aberto`\|`bloqueado`), `preco_centavos`, `sinal_percentual`, `observacao` |
| `bookings` | `id`, `codigo` (ex. `PV-2026-0042`), `user_id`, `data`, `qtd_pescadores`, `valor_total_centavos`, `sinal_centavos`, `saldo_centavos`, `status` (`pendente`\|`confirmada`\|`cancelada`\|`expirada`), `expira_em`, `confirmada_em` |
| `booking_participants` | `booking_id`, `nome`, `telefone` |
| `payments` | `id`, `booking_id`, `provider_payment_id`, `metodo` (`pix`\|`credito`\|`debito`), `valor_centavos`, `status`, `payload_bruto` (jsonb) |
| `catches` | `id`, `user_id`, `booking_id?`, `foto_path`, `especie`, `peso_kg`, `comprimento_cm`, `lat`, `lng`, `local_nome`, `capturado_em` |
| `catch_likes` | `catch_id`, `user_id` |
| `devices` | `user_id`, `expo_push_token`, `plataforma` |
| `notification_log` | `destino`, `canal`, `template`, `status`, `erro`, `enviado_em` |

**Trava anti-conflito de data (crítico):** índice único parcial

```sql
create unique index bookings_data_ativa
  on bookings (data) where status in ('pendente','confirmada');
```

Isso torna impossível dois clientes fecharem o mesmo dia mesmo clicando ao mesmo tempo. Reserva
`pendente` expira em 20 minutos (job `pg_cron`) e libera a data.

**RLS:** cliente lê/escreve só o que é dele; `availability_days` e `catches` são leitura pública para
autenticados; escrita em `availability_days`, `payments` e mudança de status só por `role = 'admin'`
ou pela `service_role` das Edge Functions.

---

## Fluxos principais

### 1. Reserva + pagamento
1. Cliente escolhe a data livre no calendário → informa nº de pescadores e os participantes (nome + telefone).
2. App chama Edge Function `criar-reserva` → cria `booking` **pendente** (a trava única segura a data por 20 min) e gera a cobrança do sinal no Mercado Pago (Pix copia-e-cola/QR ou cartão).
3. Cliente paga. O Mercado Pago chama a Edge Function `mercadopago-webhook`.
4. Webhook (idempotente por `provider_payment_id`) valida o valor, marca `payments.status = aprovado`, muda a reserva para **confirmada** e gera o código `PV-AAAA-NNNN`.
5. Dispara `enviar-notificacao`: SMS + e-mail + push com o número da reserva, data, saldo a pagar e ponto de encontro.
6. Se não pagar em 20 min, o job expira a reserva e a data volta a aparecer livre.

> A confirmação **nunca** depende do app estar aberto — quem confirma é o webhook. Se o cliente fechar o app durante o Pix, a reserva confirma do mesmo jeito.

### 2. Postar captura
1. Pescador tira/escolhe a foto, informa espécie e peso; o app captura o GPS (`expo-location`).
2. Marca d'água aplicada **no dispositivo**: a foto é renderizada numa `View` com o logo Pesca Vertical + espécie/peso/data/local e capturada com `react-native-view-shot` — a imagem já sobe marcada, sem processamento de imagem no servidor.
3. Upload para o Storage → insere em `catches` → Edge Function `notificar-captura` faz o fan-out de push para todos os `devices` e e-mail para quem optou por receber.
4. Feed mostra a foto, o mapa do ponto e curtidas.

---

## Etapas de implementação

**Fase 0 — Contas e credenciais (você providencia; eu não consigo criar):**
conta Mercado Pago (chaves de produção + teste), Twilio ou Zenvia, Resend + domínio, Apple Developer
(US$ 99/ano), Google Play (US$ 25 único), logo em PNG com fundo transparente para a marca d'água.

**Fase 1 — Fundação:** monorepo, projeto Expo com expo-router, projeto Supabase, migration com o schema
e RLS acima, login por telefone com OTP, tela de perfil, aceite de termos/LGPD.

**Fase 2 — Agenda e reserva (sem pagamento):** tela de calendário lendo `availability_days`, tela de
detalhe do dia, formulário de participantes, Edge Function `criar-reserva`, tela "Minhas reservas",
job de expiração.

**Fase 3 — Pagamento:** integração Mercado Pago (Pix + cartão), Edge Function `mercadopago-webhook`
com validação de assinatura e idempotência, geração do código da reserva, tela de status do pagamento
com polling.

**Fase 4 — Notificações:** Edge Function `enviar-notificacao` (SMS/e-mail/push com templates),
registro de `expo_push_token`, lembretes D-3 e D-1 via `pg_cron`, `notification_log`.

**Fase 5 — Feed de capturas:** captura de foto + GPS, marca d'água no cliente, upload, feed com
mapa e curtidas, `notificar-captura`.

**Fase 6 — Administração:** modo admin no app (agenda do dia, reservas, check-in, bloquear data) e
painel web Next.js (calendário, preços, participantes, pagamentos, exportar CSV, disparo manual de aviso).

**Fase 7 — Publicação:** build EAS, TestFlight + Play Internal Testing, política de privacidade,
ícones/splash, submissão às lojas.

---

## Ideias que eu incluiria já na v1 (baratas e de alto retorno)

1. **Lista de espera para datas ocupadas** — se alguém cancela, o app avisa a fila na hora. Recupera receita que hoje se perde.
2. **Previsão do tempo do dia da pescaria** na tela da reserva (API Open-Meteo, grátis, sem chave) — reduz muito o "vai chover?" no WhatsApp.
3. **Lembrete D-3/D-1 com checklist** (o que levar, ponto e horário de encontro) — corta atraso e no-show.
4. **Termo de responsabilidade aceito no app**, com data e IP registrados — proteção jurídica real para pescaria embarcada.
5. **Ranking mensal do maior peixe** — usa dados que o feed já coleta e traz o pessoal de volta ao app entre pescarias.
6. **Avaliação pós-pescaria (1 pergunta + nota)** disparada D+1 — vira prova social e detecta problema cedo.
7. **Política de cancelamento visível na hora do pagamento** (ex.: reagenda até 7 dias antes; sinal não devolvido depois disso) — evita 90% das discussões de estorno.

---

## Riscos e pontos de atenção

- **GPS exato no feed:** você optou por coordenada precisa. É o que dá mais graça ao feed, mas expõe o ponto de pesca a qualquer cliente — vale saber que isso costuma incomodar pescador experiente e atrair gente ao local. Vou implementar como escolhido, deixando um interruptor por post ("ocultar ponto") e uma chave global no admin, para você poder mudar de ideia sem precisar de nova versão nas lojas.
- **LGPD:** os participantes são terceiros cadastrados por outra pessoa. O app vai exibir aviso de que o titular declara ter autorização, guardar o aceite e oferecer exclusão de dados. O uso do telefone/e-mail para os alertas de captura precisa de opt-in separado na tela de perfil.
- **Custo de SMS:** SMS transacional no Brasil sai ~R$ 0,08–0,15. Confirmação e lembretes: OK. Alerta de captura: **não** vai por SMS (só push e e-mail), senão o custo explode.
- **Estorno de cartão (chargeback):** por isso o sinal por Pix é o caminho preferencial — no app o Pix aparece primeiro.
- **Aprovação nas lojas:** conte ~1 a 2 semanas entre a primeira submissão e a aprovação da Apple.

---

## Custo mensal estimado (operação pequena)

Supabase Free/Pro (US$ 0–25) · Vercel Free · Expo/EAS Free–US$ 19 · Resend Free (3k e-mails) ·
SMS por uso (~R$ 30–80/mês) · Mercado Pago por transação (Pix ~0,99%, crédito ~4,98%) ·
Lojas: US$ 99/ano + US$ 25 uma vez. **Base fixa: de ~R$ 0 a ~R$ 250/mês.**

---

## Verificação

1. **Conflito de agenda:** dois dispositivos tentam reservar a mesma data ao mesmo tempo → um recebe erro claro "data acabou de ser reservada"; o banco tem exatamente 1 registro ativo.
2. **Pagamento (sandbox Mercado Pago):** pagar com Pix de teste → reserva vira `confirmada` em segundos, código gerado, SMS/e-mail/push chegam. Reenviar o mesmo webhook manualmente → nada duplica (idempotência).
3. **Expiração:** criar reserva e não pagar → após 20 min a data volta a aparecer livre no calendário.
4. **Feed:** postar captura com GPS → a foto salva no Storage já vem com a marca d'água e o push chega nos outros dispositivos de teste.
5. **Permissões (RLS):** com o token de um cliente, tentar ler reservas de outro e alterar `availability_days` → ambos devem ser negados.
6. **Ponta a ponta em device real:** build EAS de preview instalada em um iPhone e um Android, percorrendo cadastro → reserva → pagamento → confirmação → postagem de captura.

Testes automatizados na v1 ficam concentrados onde o dinheiro passa: testes de integração das Edge
Functions `criar-reserva` e `mercadopago-webhook` (Deno test) e testes SQL das políticas RLS. UI fica
com verificação manual, para não inflar o tempo da primeira versão.
