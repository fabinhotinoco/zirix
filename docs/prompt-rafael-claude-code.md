# Prompt para o Claude Code do Rafael

Como usar: o Rafael abre o Claude Code **no repositório do ZXCRM/TalkWork** e
cola o texto abaixo, entre as linhas `=====`, como primeira mensagem.

=====

Você vai implementar a entrada automática de leads do **Podcast Zirix** no
**ZXCRM** e a ligação com a **TalkWork** (WhatsApp). Os dois sistemas estão
neste código e compartilham a mesma base. Antes de escrever qualquer código,
leia o projeto, entenda como já funciona a integração nativa com os formulários
da Meta (Instagram/Lead Ads) no ZXCRM e o módulo de WhatsApp da TalkWork, e
me apresente um plano curto com os arquivos que vai mexer. Só implemente
depois que eu aprovar o plano.

## Contexto do negócio

- A Zirix lança um podcast em **12/01/2027** para gerar leads de empresas de
  ônibus (urbano, intermunicipal e fretamento). Os leads precisam cair **ao
  mesmo tempo no ZXCRM e no WhatsApp dos vendedores**, sem digitação.
- **Ensaio completo (EP00) na semana de 07/12/2026.** Tudo abaixo precisa estar
  em produção e testado até **04/12/2026**.
- Vendedores: Mauricio e Walner (internos, um por segmento) e André (externo).
  Diretor comercial: Fabio.

## Estado atual (verificado em 18/11/2026)

- **ZXCRM:** API externa só leitura, `GET /external/crm/cards`, autenticação
  pelo cabeçalho `x-trckd-api-key`. Leads de formulário da Meta já entram de
  forma nativa, com `metadata` contendo `campaign_name`, `adset_name`,
  `ad_name`, `form_id`, `leadgen_id`, `answers`, `is_organic`, `platform` e
  `source`. Nos negócios ganhos, os `items[]` trazem equipamento
  (`crm_device_type_id`) e instalação (`service_type_id`), **mas não a
  mensalidade**.
- **TalkWork:** número de WhatsApp conectado pela API oficial da Meta (o dos
  alertas operacionais do ZX ITS). Usuários: Fabio e Rafael (admins). Setores,
  etiquetas e respostas rápidas: nenhum. Qualificação de lead
  (`/support/lead-qualification`) vazia. IA desligada. Módulos CRM e Instagram
  da TalkWork não contratados.
- **Um número comercial novo** será conectado na mesma conta da Meta e na mesma
  TalkWork, separado do número dos alertas. Ele é o número de **vendas da Zirix
  em geral**, e não só do podcast.

## O que implementar

### 1. Conversa nova na TalkWork → negócio no ZXCRM

Quando um contato **novo** escrever para o **número comercial** (não para o
número dos alertas), criar um card no funil do ZXCRM:

- **Origem:** se a primeira mensagem tiver um código de episódio no formato
  `[EP<nn>-<canal>]` (regex sugerida `\[EP\d{2,3}(-[A-Z]{2})?\]`, por exemplo
  `[EP03-LI]`), a origem é **"Podcast – WhatsApp"**. Sem código, a origem é
  **"Comercial – WhatsApp"**. Deixe a regra de origem configurável por número
  e por padrão de texto, sem valores fixos no código.
- Telefone em E.164 e nome do contato (do perfil do WhatsApp).
- **Observações:** a primeira mensagem completa (o código precisa estar nela).
- **Responsável (`owner`):** o atendente que assumir a conversa na fila.
  Quando ele assumir depois da criação do card, atualize o card.
- **Anúncio de clique para o WhatsApp:** quando o webhook da Meta trouxer o
  objeto de referência do anúncio (`referral`), gravar no `metadata` do card
  os mesmos campos que já gravamos para formulário (anúncio, conjunto,
  campanha).
- **Sem duplicar:** se já existir card **aberto** com o mesmo telefone, não
  criar outro. Registre o novo contato no card existente (nota ou histórico).
- **Idempotente:** reprocessar o mesmo evento da Meta não pode criar dois
  cards.

### 2. Lead de formulário no ZXCRM → conversa iniciada na TalkWork

Quando um lead de formulário da Meta entrar no ZXCRM com `campaign_name`
começando por `Podcast |` (ex.: `Podcast | EP03 | Material diesel`):

- Atribuir a origem **"Podcast – Formulário"**.
- Enviar ao lead, pelo **número comercial** na TalkWork, um **modelo de
  mensagem aprovado pela Meta**. O nome do modelo é configurável. O Claude do
  Fabio vai criar o modelo; as variáveis previstas são `{{1}}` nome do lead,
  `{{2}}` nome do vendedor e `{{3}}` tema do episódio, que vem do terceiro
  trecho do `campaign_name`.
- Colocar a conversa na **fila do setor** de acordo com a resposta de tipo de
  operação no formulário (`answers`):
  - urbano ou consórcio → setor **"Urbano/Consórcio"**;
  - intermunicipal ou fretamento → setor **"Intermunicipal/Fretamento"**;
  - sem resposta ou não reconhecida → setor **"Plantão"**.

  O mapeamento resposta → setor deve ser configurável.
- Se o envio do modelo falhar (número inválido, modelo não aprovado), marcar o
  card com uma etiqueta ou nota visível ("WhatsApp não enviado: <motivo>"), em
  vez de falhar em silêncio.
- Idempotente: o mesmo `leadgen_id` nunca envia duas mensagens.

### 3. Origens e mensalidade

- Criar no ZXCRM, por migração ou seed, as origens **"Podcast – Formulário"**,
  **"Podcast – WhatsApp"**, **"Podcast – Convidado"**, **"Podcast –
  Prospecção"** e **"Comercial – WhatsApp"**. Criar também os motivos de perda
  **"Sem frota no perfil"**, **"Já tem fornecedor com contrato"**, **"Sem
  orçamento no ciclo"** e **"Sem resposta"**. Não duplique se já existirem.
- **Mensalidade:** verifique se o valor mensal recorrente de um negócio já fica
  guardado em algum campo. Se ficar, exponha esse valor na API de leitura (ex.:
  `monthly_value`). Se não ficar, crie o tipo de serviço **"Mensalidade"**,
  para os vendedores lançarem como item com quantidade = veículos, e me diga
  qual dos dois caminhos adotou.

### 4. Leitura para o relatório do podcast (mesma chave de leitura atual)

- **Endpoints de apoio** na API externa, no mesmo envelope
  `success`/`data`/`pagination`:
  - `GET /external/crm/stages`
  - `GET /external/crm/sellers`
  - `GET /external/crm/sources`
  - `GET /external/crm/loss-reasons`

  Cada um devolve `id` e `name`.
- Se for viável no prazo: `GET /external/talkwork/conversations` com filtro por
  `updated_since`, devolvendo para cada conversa o telefone, a origem, a data
  da primeira mensagem do cliente, a data da primeira resposta humana e o
  atendente. Serve para medir o tempo até o primeiro contato.

## Restrições

- **Não mude** o comportamento atual dos leads do Instagram que já funcionam,
  nem o envio dos alertas do ZX ITS pelo número dos alertas.
- A lógica de criação de card e de envio de modelo vale **só para o número
  comercial**. O número dos alertas continua igual.
- Segurança: segredos só em variável de ambiente ou cofre, nunca no código.
  Valide a assinatura dos webhooks da Meta. Registre em log cada card criado e
  cada modelo enviado, **sem** o conteúdo das mensagens e sem dados pessoais
  além do ID.
- Siga os padrões de código, testes e migração que já existem no repositório.

## Testes de aceite (precisam passar antes de 04/12)

1. Mensagem nova no número comercial **com** `[EP03-LI]` → card "Podcast –
   WhatsApp" com o código nas observações.
2. Mensagem nova **sem** código → card "Comercial – WhatsApp".
3. Segunda mensagem do mesmo telefone com card aberto → nenhum card novo, e o
   contato aparece registrado no card existente.
4. Formulário de teste com campanha `Podcast | EP00 | Teste` e tipo de operação
   "Urbano" → card "Podcast – Formulário", modelo recebido no WhatsApp do lead
   em menos de 1 minuto e conversa na fila "Urbano/Consórcio".
5. O mesmo formulário sem tipo de operação → fila "Plantão".
6. Reenvio do mesmo evento da Meta (mesmo `leadgen_id` ou mesmo ID de mensagem)
   → nada é duplicado.
7. Mensagem para o **número dos alertas** → nenhum card criado.
8. Os 4 endpoints de apoio respondem com a chave de leitura e recusam pedido
   sem chave (401).

## O que me entregar no fim

1. Resumo do que mudou, com os arquivos e as migrações.
2. Os **IDs** das origens, setores e motivos de perda criados.
3. Como configurar: nome do modelo, regra de origem e mapeamento resposta →
   setor, e onde cada um fica.
4. Resultado de cada teste de aceite.
5. O que ficou de fora ou mudou em relação a este pedido, e por quê.

=====

## O que o Rafael também precisa fazer fora do código

| Item | Para quê | Prazo |
|---|---|---|
| Escolher e conectar o **número comercial novo** na TalkWork (guia em `docs/numero-comercial-whatsapp.md`) | Pré-requisito de tudo | 27/11 |
| Cadastrar **Mauricio, Walner e André** como atendentes na TalkWork, ou autorizar o Claude do Fabio a cadastrar | Fila e responsável | 27/11 |
| Avisar o Fabio quando os endpoints estiverem no ar e se a mensalidade virou campo ou item | Relatório do podcast | 04/12 |
| **Rotacionar a chave de leitura antiga** do ZXCRM, que estava em texto aberto num cenário do Make | Segurança | Agora |
| Enviar chaves novas **só por canal seguro**, nunca por WhatsApp ou e-mail aberto | Segurança | Sempre |
