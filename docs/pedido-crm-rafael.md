# Pedido ao Rafael: leads do Podcast Zirix no ZXCRM e na TalkWork

**De:** Fabio Tinoco · **Para:** Rafael (ZXCRM e TalkWork) · **Prazo desejado:** até 2 semanas, antes da gravação do EP01

## Contexto

Vamos lançar o Podcast Zirix em 3 semanas. O objetivo é que **todo lead caia
ao mesmo tempo no ZXCRM e no WhatsApp dos vendedores**, sem digitação.

- Os formulários da Meta (Instagram) **já caem direto no ZXCRM**, e isso continua.
- O WhatsApp comercial vai rodar na **TalkWork**, com API oficial, fila de
  vendedores, modelos de mensagem e IA.
- O que falta é **ligar a TalkWork ao ZXCRM** e **fazer o formulário disparar o
  WhatsApp**.

## O que precisamos

### 1. Conversa nova na TalkWork vira negócio no ZXCRM

Quando um contato novo escrever para o número comercial na TalkWork, criar um
card no funil do ZXCRM com:

- origem = "Podcast – WhatsApp" (ou uma origem configurável por número ou por
  palavra-chave);
- telefone e nome do contato;
- a primeira mensagem do cliente nas observações (é nela que vem o código do
  episódio, por exemplo `[EP03-LI]`);
- o atendente que pegou a conversa na fila como responsável (`owner`);
- sem duplicar: se já existe card aberto com o mesmo telefone, registrar como
  novo contato no card existente.

### 2. Lead de formulário no ZXCRM abre a conversa na TalkWork

Quando um lead de formulário da Meta entrar no ZXCRM com campanha começando por
`Podcast |`:

- a TalkWork envia ao lead um **modelo de mensagem aprovado** (ex.: "Oi, {nome}!
  Aqui é {vendedor}, da Zirix. Recebi seu pedido sobre {tema}…");
- a conversa entra na fila do vendedor responsável pelo segmento respondido no
  formulário (urbano/consórcio → um vendedor; intermunicipal/fretamento → outro;
  sem resposta → plantão);
- o vendedor recebe o aviso no aplicativo ou no celular.

### 3. Leitura para o relatório do podcast

- **Endpoints de apoio** na API externa do ZXCRM (item 7 da documentação):
  etapas, vendedores, origens e motivos de perda (`id` e `nome`).
- Se possível, a mesma leitura de conversas na TalkWork: contagem de conversas
  novas por origem ou código de episódio e tempo até a primeira resposta.

### Alternativa, se 1 e 2 não couberem no prazo

`POST /external/crm/cards` na API externa do ZXCRM, com **chave separada só
para escrita**, idempotente pelo telefone (E.164), aceitando `name`,
`contact_name`, `phone`, `email`, `source_id`, `stage_id`, `owner_id`, `notes`
e `metadata` livre. Mais um webhook de "conversa nova" na TalkWork. Com isso,
nós fazemos a ponte no Make.

## Segurança

- Chave de escrita separada da de leitura, revogável e com registro de uso.
- Limite de requisições documentado.
