# Pedido ao Rafael: entrada automática de leads do Podcast Zirix no ZXCRM

**De:** Fabio Tinoco · **Para:** Rafael (ZXCRM) · **Prazo desejado:** até 2 semanas, antes da gravação do EP01

## Contexto

Vamos lançar o Podcast Zirix em 3 semanas. Os leads de formulário da Meta
(Instagram) **já caem direto no ZXCRM**, e isso continua igual. Falta o mesmo
para os leads que chegam pelo **WhatsApp comercial**, que vai ser o principal
chamado do podcast. Hoje a API externa é só leitura (`GET /external/crm/cards`),
então nada de fora consegue criar card.

## O que precisamos (qualquer uma das duas opções resolve)

### Opção A (preferida): integração nativa do ZXCRM com o WhatsApp

Do mesmo jeito que já existe para o Instagram: cada **conversa nova** no número
comercial da Zirix (WhatsApp Business Platform / Cloud API, em modo de
coexistência com o aplicativo WhatsApp Business) vira um card no funil com:

- origem = "Podcast – WhatsApp" (ou a origem configurada para o número);
- telefone e nome do contato;
- a primeira mensagem do cliente nas observações (é nela que vem o código do
  episódio, por exemplo `[EP03-LI]`);
- sem duplicar: se já existe card aberto com o mesmo telefone, registrar como
  novo contato no card existente.

### Opção B: endpoint de escrita na API externa

`POST /external/crm/cards`, com uma **chave separada só para escrita**
(a chave atual continua só leitura), aceitando:

| Campo | Obrigatório | Observação |
|---|---|---|
| `name` | sim | Empresa, ou o nome do contato se a empresa não vier |
| `contact_name` | não | |
| `phone` | sim | Formato E.164 (`+5521...`) |
| `email` | não | |
| `source_id` | sim | Origem (ex.: "Podcast – WhatsApp") |
| `stage_id` | não | Padrão: primeira etapa do funil |
| `owner_id` | não | Responsável pelo lead |
| `notes` | não | Primeira mensagem e respostas da qualificação |
| `metadata` | não | Objeto livre: `{ "episodio": "EP03", "canal": "linkedin", "utm": "..." }` |

Comportamento esperado:
- **Idempotente pelo telefone:** se já houver card aberto com o mesmo telefone,
  devolver o card existente (e anexar `notes`) em vez de criar outro.
- Resposta com o `id` do card, no mesmo envelope `success`/`data` da leitura.

Com a opção B, nós montamos a parte do WhatsApp no Make (Cloud API → webhook →
`POST` no CRM).

## Também precisamos

**Endpoints de apoio de leitura** (previstos no item 7 da documentação), com a
mesma chave de leitura: etapas, vendedores, origens e motivos de perda (`id` e
`nome`). São para o relatório semanal do podcast mostrar nomes em vez de IDs.

## Segurança

- Chave de escrita separada da de leitura e revogável.
- Limite de requisições por minuto, documentado.
- Registro de uso, como já existe na leitura.
