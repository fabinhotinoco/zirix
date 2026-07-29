# Pesca Vertical — App de Agendamento de Pescarias (v1)

## Contexto

A Pesca Vertical hoje organiza suas pescarias fora de um sistema (WhatsApp/agenda manual), o que gera
risco de data duplicada, cobrança solta e cadastro de participantes espalhado. O objetivo desta v1 é um
app iOS + Android onde o cliente vê a agenda real, reserva um **dia inteiro exclusivo** para sua equipe,
paga um **sinal** que trava a data automaticamente, recebe confirmação com número de reserva, e onde
todos os pescadores cadastrados acompanham um feed de capturas com foto marcada.

A localização exata das capturas **não é pública**: ela é o principal benefício do plano **Diamond**,
uma assinatura anual que dá acesso à Área Diamond dentro do app. O cliente comum vê apenas o nome da
região. Isso protege os pontos de pesca e cria uma receita recorrente independente da ocupação do barco.

O repositório `fabinhotinoco/zirix` está vazio (nenhum commit). Tudo abaixo é construção nova.

**Decisões fechadas com o cliente:**
dia inteiro exclusivo · sinal + saldo no dia · React Native (Expo) + Supabase · Mercado Pago ·
SMS/e-mail/push na v1 (WhatsApp na v2) · painel web + modo admin no app ·
**Diamond vendido fora do app e ativado pelo painel** · não-Diamond vê só o nome da região ·
Área Diamond inclui localização exata, mapa de calor, reserva antecipada, desconto e detalhes técnicos.

**A definir (valores de negócio, não bloqueiam o desenvolvimento — são configuráveis no painel):**
preço anual do Diamond · percentual de desconto Diamond nas pescarias · dias de antecedência exclusiva
na agenda · percentual do sinal.

---

## Escopo da v1

**Entra:**
1. Cadastro/login por telefone (OTP via SMS)
2. Agenda em calendário com dias livres/ocupados/bloqueados e preço por dia
3. Reserva de dia exclusivo + cadastro dos participantes (nome + telefone)
4. Pagamento do sinal por Pix, crédito ou débito (Mercado Pago)
5. Confirmação automática: número da reserva por SMS, e-mail e push
6. Lembretes automáticos D-3 e D-1
7. Feed de capturas: foto com marca d'água do app + espécie/peso + **nome da região**
8. **Plano Diamond**: assinatura anual ativada pelo painel, com Área Diamond (localização exata, mapa de calor, agenda antecipada, desconto, detalhes técnicos)
9. Modo administrador no app + painel web de gestão
10. **Lista de espera** para datas ocupadas, com aviso imediato quando libera
11. **Previsão do tempo** do dia da pescaria na tela da reserva
12. **Checklist** no lembrete D-3/D-1 (o que levar, ponto e horário de encontro)
13. **Termo de responsabilidade** aceito no app, com data e IP registrados
14. **Ranking mensal do maior peixe**
15. **Avaliação pós-pescaria** disparada em D+1
16. **Política de cancelamento** exibida e registrada no ato do pagamento

**Fica para a v2 (proposital, para a v1 sair rápido):** WhatsApp oficial, compra do Diamond dentro do
app por In-App Purchase, pagamento do saldo pelo app, chat interno, split de pagamento, indicação.

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
| Mapa | `react-native-maps` | mapa de calor e pino do ponto na Área Diamond |
| Painel web | Next.js na Vercel | mesmo Supabase, deploy grátis |

**Regras das lojas (crítico):**
- Pescaria é serviço do mundo real → pagar a reserva por Mercado Pago dentro do app é **permitido** (Guideline 3.1.3(e) da Apple).
- Assinatura Diamond desbloqueia conteúdo digital → se fosse vendida dentro do app, a Apple exigiria In-App Purchase. Como será **vendida fora do app** (Pix/WhatsApp/presencial) e ativada pelo painel, o app **não pode conter botão de compra, preço com CTA, nem link para pagar**. A Área Diamond, para quem não é membro, mostra apenas o que ela oferece, de forma informativa, sem chamada para compra.

---

## Modelo de dados (`supabase/migrations/0001_init.sql`)

| Tabela | Campos principais |
|---|---|
| `profiles` | `id`(=auth.uid), `nome`, `telefone`, `email`, `avatar_url`, `role` (`cliente`\|`admin`), `aceite_termos_at` |
| `subscriptions` | `id`, `user_id`, `plano` (`diamond`), `inicio`, `fim`, `status` (`ativa`\|`expirada`\|`cancelada`), `valor_centavos`, `origem` (`manual`), `ativado_por`, `observacao` |
| `app_settings` | `chave`, `valor` (jsonb) — desconto Diamond, dias de antecedência, sinal padrão, preço do plano |
| `availability_days` | `data` (PK), `status` (`aberto`\|`bloqueado`), `preco_centavos`, `sinal_percentual`, `aberto_em`, `observacao` |
| `bookings` | `id`, `codigo` (ex. `PV-2026-0042`), `user_id`, `data`, `qtd_pescadores`, `valor_total_centavos`, `desconto_centavos`, `sinal_centavos`, `saldo_centavos`, `status` (`pendente`\|`confirmada`\|`cancelada`\|`expirada`), `expira_em`, `confirmada_em`, `cancelada_em`, `termo_versao`, `politica_versao` |
| `booking_participants` | `booking_id`, `nome`, `telefone` |
| `waitlist` | `id`, `user_id`, `data`, `criado_em`, `notificado_em`, `status` (`aguardando`\|`avisado`\|`convertido`\|`removido`) |
| `terms_acceptances` | `id`, `user_id`, `booking_id?`, `documento` (`termo`\|`politica_cancelamento`), `versao`, `ip`, `user_agent`, `aceito_em` |
| `reviews` | `booking_id` (PK), `user_id`, `nota` (1–5), `comentario`, `criado_em` |
| `payments` | `id`, `booking_id`, `provider_payment_id`, `metodo` (`pix`\|`credito`\|`debito`), `valor_centavos`, `status`, `payload_bruto` (jsonb) |
| `catches` | `id`, `user_id`, `booking_id?`, `foto_path`, `especie`, `peso_kg`, `comprimento_cm`, **`lat`**, **`lng`**, `regiao_nome`, **`isca`**, **`profundidade_m`**, **`hora_fisgada`**, **`condicao_tempo`**, `capturado_em` |
| `catch_likes` | `catch_id`, `user_id` |
| `devices` | `user_id`, `expo_push_token`, `plataforma` |
| `notification_log` | `destino`, `canal`, `template`, `status`, `erro`, `enviado_em` |

Campos em **negrito** em `catches` são exclusivos do Diamond e nunca saem do servidor para um cliente comum.

### Trava anti-conflito de data (crítico)

```sql
create unique index bookings_data_ativa
  on bookings (data) where status in ('pendente','confirmada');
```

Isso torna impossível dois clientes fecharem o mesmo dia mesmo clicando ao mesmo tempo. Reserva
`pendente` expira em 20 minutos (job `pg_cron`) e libera a data.

### Controle de acesso Diamond (crítico)

Toda a regra vive no banco. O app **nunca** recebe a coordenada e esconde na tela — dado que sai do
servidor é dado vazado.

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

A tabela `catches` fica sem `select` direto para clientes. O feed lê uma view:

```sql
create view v_catches_feed with (security_invoker = true) as
select
  c.id, c.user_id, c.foto_path, c.especie, c.peso_kg,
  c.comprimento_cm, c.regiao_nome, c.capturado_em,
  case when is_diamond(auth.uid()) then c.lat end            as lat,
  case when is_diamond(auth.uid()) then c.lng end            as lng,
  case when is_diamond(auth.uid()) then c.isca end           as isca,
  case when is_diamond(auth.uid()) then c.profundidade_m end as profundidade_m,
  case when is_diamond(auth.uid()) then c.hora_fisgada end   as hora_fisgada,
  case when is_diamond(auth.uid()) then c.condicao_tempo end as condicao_tempo
from catches c;
```

Quando a assinatura vence, `is_diamond` passa a retornar falso e o acesso cai sozinho — sem job, sem
intervenção manual.

**Duas armadilhas que o código precisa evitar:**
1. **A marca d'água não pode conter a coordenada.** Ela é gravada na imagem no momento da postagem e fica igual para todo mundo. A marca leva logo + espécie + peso + data + **região**. A coordenada é dado separado, entregue só pela view.
2. **O EXIF da foto precisa ser removido no upload.** Foto de celular carrega o GPS nos metadados; sem limpar, qualquer cliente baixa a imagem e lê o ponto. O `expo-image-manipulator` recodifica a imagem e descarta o EXIF antes do upload — isso é obrigatório, não opcional.

### Demais regras (RLS)
Cliente lê/escreve só o que é dele; `availability_days` é leitura para autenticados; escrita em
`availability_days`, `subscriptions`, `payments` e mudança de status de reserva só por `role = 'admin'`
ou pela `service_role` das Edge Functions.

---

## Fluxos principais

### 1. Reserva + pagamento
1. Cliente escolhe a data livre no calendário → informa nº de pescadores e os participantes (nome + telefone).
2. App chama Edge Function `criar-reserva`. Ela **recalcula o preço no servidor** (valor do dia, desconto Diamond se aplicável, sinal), cria o `booking` **pendente** — a trava única segura a data por 20 min — e gera a cobrança do sinal no Mercado Pago (Pix copia-e-cola/QR ou cartão). O preço enviado pelo app nunca é aceito.
3. Cliente paga. O Mercado Pago chama a Edge Function `mercadopago-webhook`.
4. Webhook (idempotente por `provider_payment_id`) valida o valor, marca `payments.status = aprovado`, muda a reserva para **confirmada** e gera o código `PV-AAAA-NNNN`.
5. Dispara `enviar-notificacao`: SMS + e-mail + push com o número da reserva, data, saldo a pagar e ponto de encontro.
6. Se não pagar em 20 min, o job expira a reserva e a data volta a aparecer livre.

> A confirmação **nunca** depende do app estar aberto — quem confirma é o webhook. Se o cliente fechar o app durante o Pix, a reserva confirma do mesmo jeito.

### 2. Agenda antecipada do Diamond
`app_settings.diamond_dias_antecipacao` (ex.: 14). Um dia recém-aberto pelo admin fica reservável só
por Diamond até `aberto_em + N dias`. O cliente comum enxerga a data marcada como *"abre em 12 dias"* —
mostra o benefício sem esconder a agenda e sem virar propaganda de compra.

### 3. Postar captura e visibilidade do local
1. Pescador tira/escolhe a foto, informa espécie, peso e — opcionalmente — isca, profundidade e condição do tempo; o app captura o GPS (`expo-location`).
2. A foto passa pelo `expo-image-manipulator` (**remove EXIF**) e recebe a marca d'água renderizada no dispositivo: logo Pesca Vertical + espécie/peso/data/**região**, capturada com `react-native-view-shot`.
3. Upload para o Storage → insere em `catches` com a coordenada exata → Edge Function `notificar-captura` faz o fan-out de push para todos os `devices` e e-mail para quem optou por receber.
4. **Cliente comum** vê foto, espécie, peso e o nome da região. **Diamond** vê, além disso, o pino exato no mapa, isca, profundidade, horário da fisgada e clima.

### 4. Ciclo do Diamond
1. Venda acontece fora do app (Pix, WhatsApp ou presencial).
2. Admin ativa no painel: escolhe o cliente, informa valor e data de início → cria `subscriptions` com `fim = inicio + 12 meses`.
3. Cliente recebe SMS/e-mail/push: *"Seu acesso Diamond está ativo até 29/07/2027"*. A Área Diamond desbloqueia na hora.
4. Avisos automáticos de vencimento em D-30 e D-7, e no dia do vencimento — a renovação é o momento de maior risco de perder o cliente.
5. Vencido, o acesso cai automaticamente e o app volta a mostrar só o nome da região.

### 5. Cancelamento e lista de espera
1. Numa data ocupada, o cliente toca em **"Avisar se liberar"** → entra na `waitlist`.
2. Quando a reserva daquele dia é cancelada (pelo cliente ou pelo admin) ou expira por falta de pagamento, um trigger no Postgres chama a Edge Function `avisar-lista-espera`.
3. A fila é avisada **por ordem de entrada**, com Diamond na frente, via push + SMS: *"Liberou 14/03! Reserve agora."* — este é um dos poucos casos em que o SMS se paga, porque a janela de decisão é curta.
4. A data volta a aparecer livre no calendário para todos; quem chegar primeiro fecha. Sem reserva de vaga silenciosa — a trava única do banco continua sendo a única fonte da verdade.
5. No cancelamento, a política vigente decide o destino do sinal; o app mostra o resultado antes de confirmar (*"Faltam 4 dias: o sinal não é devolvido. Confirmar cancelamento?"*).

---

## Telas

**App — cliente:** Login por telefone · Agenda (calendário) · Detalhe do dia e reserva · Participantes ·
Pagamento · Minhas reservas · Feed de capturas · Postar captura · Perfil ·
**Área Diamond** (mapa de calor dos pontos com filtro por espécie e época, mapa da captura individual,
detalhes técnicos, selo e validade da assinatura). Para quem não é membro, a Área Diamond mostra a lista
de benefícios em modo informativo, sem botão nem link de compra.

**App — admin:** agenda do dia, lista de reservas, check-in, bloquear data.

**Painel web:** calendário e preços · reservas e participantes · pagamentos · **membros Diamond**
(ativar, renovar, ver vencimentos próximos) · configurações (desconto, dias de antecedência, sinal) ·
exportar CSV · disparo manual de aviso.

---

## Etapas de implementação

**Fase 0 — Contas e credenciais (você providencia; eu não consigo criar):**
conta Mercado Pago (chaves de produção + teste), Twilio ou Zenvia, Resend + domínio, Apple Developer
(US$ 99/ano), Google Play (US$ 25 único), chave do Google Maps para Android, e o logo em PNG com fundo
transparente para a marca d'água.

**Fase 1 — Fundação:** monorepo, projeto Expo com expo-router, projeto Supabase, migration com o schema
e RLS acima, login por telefone com OTP, tela de perfil, **termo de responsabilidade versionado com
registro de IP** e consentimentos de LGPD.

**Fase 2 — Agenda e reserva (sem pagamento):** calendário lendo `availability_days`, detalhe do dia,
formulário de participantes, Edge Function `criar-reserva`, "Minhas reservas", cancelamento pelo
cliente, job de expiração.

**Fase 3 — Pagamento:** integração Mercado Pago (Pix + cartão), Edge Function `mercadopago-webhook`
com validação de assinatura e idempotência, geração do código da reserva, tela de status com polling,
**política de cancelamento com aceite registrado**.

**Fase 4 — Notificações:** Edge Function `enviar-notificacao` (SMS/e-mail/push com templates), registro
de `expo_push_token`, lembretes D-3 e D-1 **com checklist e ponto de encontro**, `notification_log`,
job `pg_cron`.

**Fase 5 — Feed de capturas:** foto + GPS, remoção de EXIF, marca d'água no cliente, upload, feed com
região e curtidas, `notificar-captura`, **ranking mensal** (`v_ranking_mensal` + anúncio automático).

**Fase 6 — Diamond:** `subscriptions`, função `is_diamond`, view `v_catches_feed`, Área Diamond com
mapa de calor e detalhes técnicos, regra de agenda antecipada, desconto aplicado no servidor, avisos de
vencimento, gestão de membros no painel.

**Fase 7 — Retenção e operação:** **lista de espera** (trigger + `avisar-lista-espera`),
**previsão do tempo** (Open-Meteo com cache), **avaliação pós-pescaria** em D+1 com alerta de nota
baixa para o admin.

**Fase 8 — Administração:** modo admin no app e restante do painel web (preços, participantes,
pagamentos, textos configuráveis, avaliações, exportação CSV).

**Fase 9 — Publicação:** build EAS, TestFlight + Play Internal Testing, política de privacidade,
ícones/splash, submissão às lojas.

---

## Funcionalidades complementares — aprovadas para a v1

Todas confirmadas pelo cliente. Como implementar cada uma:

**1. Lista de espera para datas ocupadas.** Tabela `waitlist` + trigger de cancelamento/expiração →
Edge Function `avisar-lista-espera` (push + SMS, Diamond primeiro). Fluxo detalhado acima. É a única
funcionalidade da lista que gera receita direta: recupera dia que hoje ficaria vago.

**2. Previsão do tempo.** API **Open-Meteo** — gratuita, sem chave e sem cadastro. As coordenadas da
base de operação ficam em `app_settings.local_operacao`. Exibida na tela da reserva a partir de D-7
(fora dessa janela a previsão não tem valor) e embutida no lembrete D-1. Consultada por uma Edge
Function com cache de 1 hora, para não bater na API a cada abertura de tela.

**3. Checklist no lembrete.** Texto configurável em `app_settings.checklist` e
`app_settings.ponto_encontro` — editável no painel sem precisar de nova versão do app. Entra no corpo
do lembrete D-3 (o que levar) e D-1 (ponto, horário e previsão do tempo).

**4. Termo de responsabilidade.** Versionado em `app_settings.termo` e registrado em
`terms_acceptances` com versão, IP e user-agent. Aceito no cadastro e **reconfirmado a cada reserva**
(`bookings.termo_versao`) — é isso que dá valor probatório por pescaria, não só por cliente. Se o
texto do termo mudar, o app pede novo aceite automaticamente.

**5. Ranking mensal do maior peixe.** View `v_ranking_mensal` sobre `catches` (maior `peso_kg` por mês,
com filtro por espécie). Não precisa de tabela nova. No primeiro dia do mês, um job `pg_cron` anuncia o
vencedor por push — o gancho que traz o pessoal de volta ao app entre pescarias.

**6. Avaliação pós-pescaria.** Job `pg_cron` em D+1 envia push com deep link para uma tela de nota
(1–5) + comentário opcional, gravada em `reviews`. Média e comentários aparecem no painel. Nota ≤ 3
gera alerta imediato para o admin — problema descoberto no dia seguinte ainda tem conserto.

**7. Política de cancelamento.** Versionada em `app_settings.politica_cancelamento` (texto + prazo em
dias). Exibida com aceite obrigatório na tela de pagamento, gravada em `bookings.politica_versao` e em
`terms_acceptances`. O app calcula e mostra o efeito real antes de o cliente confirmar o cancelamento.

---

## Riscos e pontos de atenção

- **Rejeição na App Store por causa do Diamond.** É o maior risco desta v1. Enquanto a assinatura for vendida fora do app, o aplicativo não pode ter botão de compra, preço com chamada para ação, nem link para pagar. Se no futuro você quiser que o cliente assine sozinho pelo app, isso exige In-App Purchase (RevenueCat, ~15% para Apple e Google) — planejado para a v2.
- **Vazamento do ponto por metadado.** Sem remover o EXIF da foto e sem filtrar a coordenada no servidor, o Diamond vira apenas um cadeado de tela, contornável em minutos. Por isso a regra vive na view do Postgres e a imagem é recodificada antes do upload.
- **LGPD:** os participantes são terceiros cadastrados por outra pessoa. O app exibirá aviso de que o titular declara ter autorização, guardará o aceite e oferecerá exclusão de dados. O uso de telefone/e-mail para os alertas de captura precisa de opt-in separado no perfil.
- **Custo de SMS:** ~R$ 0,08–0,15 por envio. Confirmação, lembretes e aviso de vencimento do Diamond: OK. Alerta de captura: **não** vai por SMS (só push e e-mail), senão o custo explode.
- **Estorno de cartão (chargeback):** por isso o Pix aparece primeiro na tela de pagamento.
- **Renovação manual do Diamond:** ativar no painel é simples, mas depende de alguém lembrar. Os avisos de D-30/D-7 e a lista de "vencendo em breve" no painel existem para isso.
- **Aprovação nas lojas:** conte ~1 a 2 semanas entre a primeira submissão e a aprovação da Apple.

---

## Custo mensal estimado (operação pequena)

Supabase Free/Pro (US$ 0–25) · Vercel Free · Expo/EAS Free–US$ 19 · Resend Free (3k e-mails) ·
SMS por uso (~R$ 30–80/mês) · Google Maps dentro da cota gratuita nesse volume ·
Mercado Pago por transação (Pix ~0,99%, crédito ~4,98%) · Lojas: US$ 99/ano + US$ 25 uma vez.
**Base fixa: de ~R$ 0 a ~R$ 250/mês.** Sem comissão de loja sobre o Diamond, já que a venda é externa.

---

## Verificação

1. **Conflito de agenda:** dois dispositivos tentam reservar a mesma data ao mesmo tempo → um recebe erro claro "data acabou de ser reservada"; o banco tem exatamente 1 registro ativo.
2. **Pagamento (sandbox Mercado Pago):** pagar com Pix de teste → reserva vira `confirmada` em segundos, código gerado, SMS/e-mail/push chegam. Reenviar o mesmo webhook manualmente → nada duplica.
3. **Expiração:** criar reserva e não pagar → após 20 min a data volta a aparecer livre.
4. **Blindagem do Diamond (o teste mais importante):** com o token de um cliente comum, chamar a API do feed direto por `curl` → os campos `lat`, `lng`, `isca`, `profundidade_m`, `hora_fisgada` e `condicao_tempo` voltam `null`. Baixar a foto do Storage e inspecionar o EXIF → sem dados de GPS. Ler a marca d'água → sem coordenada.
5. **Ciclo da assinatura:** ativar Diamond no painel → área desbloqueia; alterar `fim` para ontem → área bloqueia sozinha na próxima consulta e os campos voltam a vir nulos.
6. **Desconto e agenda antecipada:** cliente Diamond vê data ainda fechada para os demais e o valor sai com desconto; cliente comum tentando reservar a mesma data pela API recebe recusa do servidor.
7. **Feed:** postar captura → foto no Storage já marcada; push chega nos outros dispositivos.
8. **Lista de espera:** dois clientes entram na fila de uma data ocupada (um Diamond, um comum) → cancelar a reserva → o Diamond é avisado primeiro, a data reaparece livre e o primeiro que pagar fecha; o segundo recebe a recusa correta.
9. **Termo e política:** aceitar, publicar uma nova versão do texto no painel e reservar de novo → o app pede aceite outra vez e `terms_acceptances` guarda as duas versões com IP e data.
10. **Avaliação:** forçar o job de D+1 numa reserva passada → push chega; nota 3 gera alerta para o admin.
11. **Previsão do tempo:** abrir a reserva a 5 dias da data → previsão aparece; a 20 dias → tela não mostra previsão e não chama a API.
12. **Permissões (RLS):** com token de cliente, tentar ler reservas de outro, alterar `availability_days` ou criar `subscriptions` → todos negados.
13. **Ponta a ponta em device real:** build EAS de preview num iPhone e num Android, percorrendo cadastro → reserva → pagamento → confirmação → captura → Área Diamond.

Testes automatizados na v1 ficam concentrados onde há dinheiro e onde há segredo: testes de integração
das Edge Functions `criar-reserva` e `mercadopago-webhook` (Deno test) e testes SQL das políticas RLS e
da view `v_catches_feed` — este último rodando com JWT de cliente comum e de Diamond, para garantir que
a coordenada nunca escape. UI fica com verificação manual, para não inflar o tempo da primeira versão.
