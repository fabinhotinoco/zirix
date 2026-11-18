# Podcast Zirix — estratégia e operação

**Status:** proposta para aprovação · **Data:** 18/11/2026 · **Dono:** Fabio Tinoco (Diretor Comercial)

---

## 1. Intenção

O Podcast Zirix existe para **gerar leads e engajamento** entre quem decide em
**empresas de ônibus urbano, intermunicipal e de fretamento**, com foco no
**Sudeste** e ponto de partida no **Rio de Janeiro**, onde a solução ZXbus está
implantada nos consórcios operadores.

O conteúdo abre a conversa e o comercial entra com contexto. Ninguém recebe
"quer comprar rastreador?": o primeiro contato sempre cita o episódio ou o corte
que a pessoa viu.

### Por que funciona nesse nicho

- **Episódio longo gera confiança; corte gera alcance.** Decisor de operadora
  consome trechos de 30 a 90 s no LinkedIn, Instagram e WhatsApp, e raramente o
  episódio inteiro.
- **Convidado do setor é o motor.** Cada gestor que grava divulga para a própria
  rede e já vira relacionamento comercial. A gravação é a primeira reunião.
- **Sudeste aparece em três lugares:** convidados (operadoras e consórcios de
  RJ, SP, BH, Campinas), temas regionais e segmentação de anúncio.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**
- Gerar leads qualificados de operadoras de ônibus, medidos por episódio e por
  canal, e pipeline em **mensalidade recorrente** (a Zirix lucra na
  recorrência, não no hardware).
- Construir autoridade da Zirix e do Fabio no setor de transporte por ônibus.
- Operar com **dois apresentadores que também produzem**, sem editor dedicado.

**Não objetivos (por enquanto)**
- Audiência de massa ou monetização do podcast em si.
- Site ou landing page própria.
- Integração automática de leads no ZXCRM: depende de endpoint de escrita que a
  API atual não tem (§9.4).

**Anti-objetivos (fracasso mesmo que "funcione")**
- Episódio que vira propaganda: o convidado não volta e não divulga.
- Promessa que não se sustenta no contrato. Ver §11.
- Lead que chega e fica sem resposta. Pior do que não gerar o lead.
- Produção que consome Fabio e Saulo a ponto de o calendário quebrar.

## 3. Público e posicionamento

| Quem | Cargo | O que importa para essa pessoa |
|---|---|---|
| Decisor | Dono, diretor de operações | Custo por km, contrato de concessão, multa e indicador do poder concedente |
| Influenciador | Gerente de manutenção, de frota, de tráfego | Disponibilidade da frota, consumo, quebra, motorista |
| Segmentos | Urbano/consórcio · intermunicipal · fretamento | Dores diferentes; cada episódio declara para quem é |

**Posicionamento:** o podcast de quem opera ônibus, feito por quem está dentro
da operação (tecnologia embarcada nos consórcios do Rio). Fala de operação, não
de produto.

## 4. Formato e calendário

| Item | Definição |
|---|---|
| Nome | **Podcast Zirix** (nome de trabalho; revisar antes do lançamento) |
| Apresentadores | **Fabio Tinoco** e **Saulo** (experiência prévia em podcast) |
| Frequência | **Quinzenal** nos primeiros 6 meses, depois **semanal** |
| Duração do episódio | 40 a 60 min |
| Cortes por episódio | 4 a 6 verticais (30 a 90 s) + 1 trecho horizontal de 3 a 5 min para LinkedIn e YouTube |
| Locais | **Estúdio:** sala de reunião da Zirix · **Externo:** garagens e sedes dos clientes (consórcios do Rio) |

### Três quadros

1. **Convidado da operação** (núcleo): gestor de operadora, consórcio ou
   fretadora. Gravado no estúdio ou na garagem dele.
2. **Na garagem** (externo): gravação ou live no cliente, mostrando a operação
   real. Máximo engajamento, máxima prova social.
3. **Zirix explica** (curto, sem convidado): Fabio e Saulo explicam um tema
   (por exemplo, como ler um relatório de consumo). Episódio de reserva para
   quando um convidado desmarcar e o calendário não pode furar.

### Banco de temas inicial

Licitações e concessões · eletrificação da frota · tarifa zero · consumo de
diesel · disponibilidade e manutenção · segurança, ADAS e DMS (com as ressalvas
do §11) · gestão de motoristas · indicadores do poder concedente · fretamento
corporativo e escolar · Lei 12.587 (Política Nacional de Mobilidade Urbana).

## 5. Produção

### 5.1 Princípio

Cada iPhone grava o próprio arquivo, e o áudio vem de **lapelas sem fio com um
canal por pessoa**. Esse arranjo permite (a) sincronizar câmeras pelo áudio e
(b) saber quem fala a cada instante pela energia de cada canal, sem software
pago de identificação de voz. A edição longa e os cortes acontecem neste
ambiente (§6).

### 5.2 Câmeras

| Câmera | Aparelho | Função | Configuração |
|---|---|---|---|
| **A — estática** | iPhone 16 do Fabio | Plano geral, sempre ligado; é a **câmera mestre** | Tripé, horizontal, **4K 30 fps**, HEVC, enquadramento fixo com os dois (ou três) e o logo ao fundo. 4K porque cada corte vertical é um recorte do plano geral: em 1080p, o recorte de cada pessoa ficaria com cerca de 600×1080 e perderia nitidez ao ampliar para 1080×1920. Cerca de 10 GB por hora. |
| **B — móvel** | 2º iPhone (de preferência um já existente na Zirix, como o do Saulo; iPhone 13 ou mais novo) | Planos fechados, reações, detalhes (miniaturas, garagem, ônibus) | Mão ou tripé, horizontal, 1080p 30 fps |

- App de gravação: **Blackmagic Camera** (grátis), com foco, exposição e
  balanço de branco **travados**. A parede branca engana o automático do iPhone.
- **Modo avião** nos dois aparelhos durante a gravação.
- **Palma** na frente das câmeras no início (marca de sincronia de reserva).

### 5.3 Áudio (prioridade da compra)

- **Uma lapela sem fio por pessoa, com gravação interna no transmissor.** A
  **gravação interna de cada transmissor é a fonte oficial de áudio** do
  episódio: um arquivo por pessoa, sincronizado pelo áudio das câmeras. O
  receptor no iPhone serve só de reserva e para as lives. Assim o fluxo não
  depende de onde o receptor está ligado.
- **Requisito de compra:** transmissores com gravação interna, em número igual
  ao de vozes. Com convidado são **3**, então dois kits de 2 transmissores ou um
  sistema que aceite 3 ou mais. Faixa: Hollyland Lark M2, DJI Mic Mini, DJI Mic 2
  (confirmar a gravação interna no modelo escolhido).
- Se houver só 2 transmissores numa gravação, quem dividir canal é identificado
  por marcação manual na aprovação dos cortes. É um modo degradado, não o padrão.
- As câmeras gravam o próprio áudio só para sincronia.

### 5.4 Set no estúdio (sala de reunião)

- Logo na parede branca **fora do centro**, atrás de quem fala; miniaturas de
  ônibus numa prateleira ou aparador dentro do plano geral.
- **Luz nas pessoas, não na parede**: 2 painéis LED com difusor a 45°. Parede
  branca estoura no vídeo se for a área mais clara.
- Acústica: sala de reunião ecoa. Tapete, cortina ou painéis atrás das câmeras.
  A lapela já resolve boa parte.

### 5.5 Externo e lives no cliente

- **Antes:** autorização escrita do cliente para gravar nas instalações e
  autorização de uso de imagem de quem aparece (ver §11). Visita técnica de
  10 min ao local antes de gravar: ruído, luz, onde ficam as câmeras.
- **Gravação externa:** mesmo arranjo (A estática + B móvel + lapelas). A câmera
  B ganha mais peso: pátio, ônibus, oficina.
- **Live:** transmitida pelo Instagram (ou YouTube) **a partir do iPhone B**,
  com a lapela ligada nele. O iPhone A grava o plano geral em paralelo. A
  gravação vira episódio e cortes depois, pelo fluxo normal.

### 5.6 Lista de compras (faixas aproximadas, a confirmar na compra)

| Item | Prioridade | Faixa |
|---|---|---|
| Lapelas sem fio com gravação interna: **Hollyland Lark Max 2, Combo 4 pessoas** (4 transmissores, gravação interna 32-bit float). Antes de comprar, confirmar: 4 transmissores, receptor USB-C, produto novo com garantia no Brasil. Alternativa premium: DJI Mic 3 (2 TX + 1 avulso), que grava timecode. | 1 — essencial | R$ 2.160 a 2.930 |
| 2 tripés com suporte de celular | 1 | R$ 150 a 300 cada |
| HD externo 2 TB (arquivo do bruto) | 1 | R$ 400 a 550 |
| 2 painéis LED com difusor | 2 | R$ 300 a 600 |
| SSD externo 1 TB (descarregar o iPhone com rapidez) | 3 | R$ 400 a 600 |
| 2º iPhone (só se não houver aparelho disponível na Zirix) | 3 | usado, iPhone 13 ou mais novo |
| Estabilizador (gimbal) para a câmera B | 4 — depois | R$ 600 a 900 |

**Volume de bruto:** câmera A em 4K HEVC (cerca de 10 GB/h), câmera B em 1080p
(cerca de 4 GB/h) e áudios. São **cerca de 15 GB por episódio**, ou 600 GB no
primeiro ano (cerca de 39 episódios). Um HD de 2 TB cobre uns 3 anos. A
estimativa anterior de 3 TB considerava câmeras dedicadas com bitrate muito
maior que o HEVC do iPhone.

## 6. Pós-produção: o que acontece neste ambiente

### 6.1 Fluxo de cada episódio

0. **Como é disparado:** Fabio ou Saulo abrem uma sessão do Claude no ambiente
   "Podcast Zirix" e pedem "processa o EP03". Eu rodo as ferramentas versionadas
   em `producao/` e paro em dois pontos para aprovação (lista de cortes e
   episódio montado). Não há disparo automático nem interface própria nesta fase.
1. **Descarga:** os dois vídeos (A e B) e os áudios dos transmissores vão para
   uma pasta do episódio no **Google Drive** (`Podcast Zirix/EP03/`). O bruto
   também é copiado para o HD. Usar a conta Google com mais espaço (de
   preferência a do Google Workspace da Zirix). Um episódio em 4K passa de
   12 GB, então a pasta de entrada é temporária e é esvaziada depois do
   processamento.
2. **Ingestão aqui:** baixar os arquivos da pasta do episódio para o ambiente.
   O mecanismo exato (link temporário ou API do Drive) e o host a liberar ficam
   para o plano. Ambiente sem GPU: a transcrição roda em CPU (modelo `small`,
   escolhido por velocidade) e o processamento de um episódio de 60 min é feito
   em etapas que podem ser retomadas.
3. **Sincronia:** alinhar A e B pelo áudio (correlação cruzada) com ffmpeg e
   Python. A palma é a reserva.
4. **Transcrição:** Whisper (modelo `small` ou `medium` em português) com marca
   de tempo por palavra.
5. **Quem fala:** energia por canal da lapela, mapeada para Fabio, Saulo e
   convidado.
6. **Montagem do episódio longo:** base na câmera A; insere planos da câmera B
   em trocas de fala e falas longas (regra simples e determinística, ajustável).
   Remove o início e o fim mortos. Normaliza o áudio em −16 LUFS (padrão de
   podcast). Abertura e encerramento fixos com o chamado para o WhatsApp.
7. **Seleção dos cortes:** a partir da transcrição, escolha de 4 a 6 trechos com
   gancho nos primeiros 3 segundos, uma ideia completa e relevância para a dor
   do segmento. Lista enviada para aprovação do Fabio ou do Saulo antes de
   renderizar.
8. **Render dos cortes:** 9:16, 1080×1920, enquadramento em quem fala (recortes
   fixos por posição do plano geral, alternando pela energia do canal),
   **legenda queimada** com a identidade da Zirix, cartela final com o chamado.
9. **Textos:** título, descrição com capítulos, legenda por rede, hashtags e
   link com código de rastreio (§8.3).
10. **Thumbnails:** quadro escolhido do vídeo, mais título e logo.
11. **Entrega:** arquivos finais na pasta `Final/` do episódio no Drive. Pacote
    de divulgação do convidado (cortes, arte e texto) numa subpasta própria.

**Tempo humano alvo por episódio, depois de gravado:** até 1 h (descarga,
aprovar a lista de cortes, revisar o episódio e publicar).

### 6.2 Ferramentas e decisões técnicas

| Necessidade | Escolha | Motivo |
|---|---|---|
| Corte, render e áudio | ffmpeg (já presente no ambiente) | Determinístico, grátis, roda aqui |
| Transcrição | faster-whisper (local) | Grátis, preciso em português, marca por palavra |
| Sincronia e quem fala | Python (numpy/scipy) | Correlação de áudio e energia por canal |
| Código | Neste repositório, em `producao/` | Versionado e reaproveitado a cada episódio |
| Gráficos (legenda, cartela, thumbnail) | Templates próprios (ASS para legenda, PNG para cartela) | Identidade consistente sem depender de app pago |

**Ambiente de nuvem ("Podcast Zirix"):** precisará de um script de setup que
instale faster-whisper e dependências, mais a liberação dos hosts de download do
modelo (Hugging Face) e do Google Drive. A liberação será proposta quando a
ferramenta for montada, com aprovação do Fabio.

**Ferramenta paga descartada por ora:** vidIQ (plano grátis com 150 créditos
por mês, e um episódio de 60 min custaria 540 créditos em cortes). Riverside e
Opus Clip ficam como plano B, se o fluxo próprio não segurar o semanal.

## 7. Distribuição

| Canal | O que vai | Quem publica |
|---|---|---|
| **YouTube** (canal da Zirix) | Episódio completo + cortes como Shorts | Fabio ou Saulo |
| **Spotify for Creators** | Episódio (vídeo e áudio), RSS para Apple Podcasts e Amazon Music | Fabio ou Saulo |
| **Instagram** (@zirixrastreamento) | Reels (cortes), stories no lançamento, lives no cliente | Fabio ou Saulo |
| **LinkedIn — perfil pessoal do Fabio** | Corte horizontal de 3 a 5 min e cortes verticais, com texto de opinião | Fabio |
| **WhatsApp** | Status no lançamento e envio individual para leads em cadência | Vendedores |

**Calendário de publicação de cada episódio (dia D = lançamento):**
- D: episódio completo no YouTube e no Spotify, 1 corte no Instagram e no
  LinkedIn, pacote para o convidado.
- D+2, D+4, D+7, D+9: um corte por vez, alternando os canais.
- No semanal, os cortes do episódio anterior se intercalam com os do novo.

## 8. Conversão

### 8.1 Porta única: WhatsApp

**Um número de WhatsApp Business só do podcast/comercial**, compartilhado entre
os vendedores (aparelhos vinculados), nunca o número pessoal de alguém.

**Captura automática no CRM (decisão do Fabio: os leads do podcast devem cair
sozinhos no ZXCRM, como os do Instagram já caem).** O ZXCRM já recebe os leads
de **formulário instantâneo da Meta** de forma nativa. Por isso, o formulário
instantâneo é a **captura principal** do podcast: todo anúncio de episódio ou de
material usa formulário com as 4 perguntas. Campanha e formulário seguem o padrão
`Podcast | EP03 | <tema>`, para o card chegar identificado pelo `metadata`, sem
digitação. Validar com um lead de teste na semana 2.

Para o lead de WhatsApp também cair sozinho, falta uma peça do lado do ZXCRM,
porque a API atual só lê. **Decisão do Fabio: tudo automático desde o EP01.** O pedido ao Rafael (§9.4,
item 5) entra no caminho crítico, com prazo de 2 semanas. O número comercial usa
a **API oficial do WhatsApp em modo de coexistência**: os vendedores continuam
atendendo pelo aplicativo WhatsApp Business, e cada conversa nova também gera um
evento que cria o card. Se a entrega do Rafael atrasar, as fases abaixo são o
plano de contingência, e o lançamento não para.

Formulários orgânicos da Meta também já caem no CRM (`metadata.is_organic`),
então o formulário pode ser oferecido no perfil e nos stories, não só em
anúncio.

**Fase 1 — aplicativo WhatsApp Business (grátis):** o aplicativo não tem API,
então o lead de WhatsApp **não chega sozinho ao Make**. O plantão cria o card no
ZXCRM no primeiro contato, com origem e código do episódio. As perguntas da isca
são respostas rápidas salvas no aplicativo. O tempo até o primeiro contato do
WhatsApp é medido pelo próprio plantão (hora da mensagem anotada no card).

**Fase 2 — API oficial do WhatsApp (Cloud API, direta ou via provedor):** só
quando o volume passar de cerca de 30 leads por mês ou o plantão não segurar os
15 min. Ela traz webhook para o Make, robô de qualificação, captura automática
do código do episódio e medição exata, com custo por conversa.

### 8.2 Chamados

- **Fim de cada vídeo (5 s, sempre igual):** "Quer um diagnóstico da sua frota?
  Chama no WhatsApp da Zirix."
- **Isca para quem não está pronto:** um material por tema (checklist,
  diagnóstico), entregue pelo WhatsApp em troca de até 4 respostas: empresa,
  cidade/UF, tipo de operação (urbano, intermunicipal, fretamento) e tamanho da
  frota.

### 8.3 Rastreio

Todo link leva o código do episódio e do canal, por exemplo
`?utm_source=linkedin&utm_campaign=ep03`, e a mensagem pré-preenchida do
WhatsApp leva o código (`[EP03-LI]`). O vendedor registra esse código no card do
CRM.

### 8.4 Anúncios na Meta

| Uso | Formato |
|---|---|
| Impulsionar os melhores cortes para gestores do Sudeste | **Anúncio de clique para o WhatsApp** |
| Oferecer o material do episódio | **Formulário instantâneo (Lead Ads)** |

Sem landing page. Ela só passa a valer se houver anúncio fora da Meta.

## 9. Comercial: quem faz o quê

### 9.1 Papéis

| Pessoa | Papel no podcast |
|---|---|
| **Fabio** (Diretor Comercial) | Apresenta e produz. Cuida dos convidados (tipo A) do convite ao pós-gravação. É a voz da Zirix no LinkedIn. |
| **Saulo** | Apresenta e produz. Responsável pela gravação, áudio e descarga. |
| **Mauricio** e **Walner** | Atendem o WhatsApp do podcast, qualificam e fecham. **Dono por segmento:** um fica com urbano e consórcios, o outro com intermunicipal e fretamento. **Plantão alternado por dia** só para o primeiro contato de quem ainda não disse o segmento e para cobrir ausência do dono. Depois de identificado o segmento, o lead passa para o dono. |
| **André** (externo) | Visitas presenciais aos leads prioridade A e aos convidados que pedirem diagnóstico. |

### 9.2 Tipos de lead e prazo do primeiro contato

| Tipo | Origem | Responsável | Canal | Prazo |
|---|---|---|---|---|
| A. Convidado | Gravação | Fabio, com André na visita técnica | WhatsApp pessoal e presencial | 48 h após gravar |
| B. Quente | Pediu conversa ou diagnóstico | Plantão; se prioridade A, André | WhatsApp, depois ligação ou vídeo | **15 min** em horário comercial |
| C. Morno | Baixou material | Plantão | WhatsApp | 24 h |
| D. Engajado | Comentou ou seguiu | Fabio | LinkedIn | Sem cadência formal |
| E. Alvo frio | Lista do Sudeste | Mauricio e Walner, 5 empresas por semana cada | WhatsApp ou e-mail com um corte relevante; convite para o podcast como gancho | Semanal |

### 9.3 Prioridade para operadoras de ônibus

| Prioridade | Critério | Ação |
|---|---|---|
| A | Mais de 200 ônibus, Sudeste, decisor | André assume a visita |
| B | 51 a 200 ônibus, ou influenciador numa operadora grande | Plantão qualifica e marca reunião |
| C | Até 50 ônibus, fora do Sudeste ou sem perfil | Nutrição (novos episódios e materiais) |

Os cortes de faixa são calibração inicial; revisar com o histórico de vendas
depois de 3 meses. A régua genérica do Make (20 e 5 veículos) segue valendo para
os outros segmentos.

**Cadência para lead morno sem resposta:** D0 material e perguntas · D2 corte ·
D5 LinkedIn · D10 oferta de diagnóstico · D21 encerramento e nutrição.

### 9.4 Sistemas

**Como funciona hoje (verificado em 18/11/2026):**
- **Make, cenário "Lead Zirix — Captação e Roteamento (v1)":** webhook, evita
  duplicar pelo e-mail, classifica em A/B/C, grava num data store e avisa no
  Slack.
- **ZXCRM** (crm.zirix.com.br, versão com a marca Zirix do Tracked/Jotapê
  Tecnologia): API externa **somente leitura** (`GET /external/crm/cards`,
  autenticação pelo cabeçalho `x-trckd-api-key`), com filtro por `status`,
  `stage_id`, `source_id` e `updated_since`, e até 200 itens por página. Cada
  card traz: `status`, `stage_id`, `owner_id`, `source_id`, `deal_value`,
  datas (`created_at`, `updated_at`, `lost_at`, `next_follow_up_at`), motivo de
  perda, contato (`contact_name`, `phone`, `email`, `notes`), `items[]` com
  quantidade e valor unitário, e `metadata` para leads vindos de anúncio. A
  API devolve **IDs**, não nomes: os nomes de etapa, vendedor, origem e motivo
  dependem dos endpoints de apoio ou de uma tabela de-para fornecida pela Zirix.
  Fonte: guia "Acesso Externo ao CRM — Guia de Integração" (Zirix
  Rastreamento), anexado na conversa de 18/11/2026.

**Mudanças necessárias:**
1. **Cenário de captação:** aceitar lead **sem e-mail**, usando o telefone
   normalizado (E.164) como chave. Hoje ele recusa, e lead de WhatsApp quase
   nunca tem e-mail. Aplicar a régua de ônibus do §9.3 quando `segmento` for
   ônibus. Incluir no aviso do Slack o código do episódio e o responsável do
   plantão.
2. **Leads Formulários Meta:** passar de leitura diária para entrada imediata no
   cenário de captação. Se o ZXCRM já recebe os formulários de forma nativa
   (a confirmar), manter só o aviso.
3. **No ZXCRM, criar as origens:** "Podcast – Convidado", "Podcast – WhatsApp",
   "Podcast – Formulário", "Podcast – LinkedIn", "Podcast – Instagram",
   "Podcast – Prospecção". Criar também os motivos de perda: "Sem frota no
   perfil", "Já tem fornecedor com contrato", "Sem orçamento no ciclo",
   "Sem resposta".
4. **Cadastro no CRM:** manual pelo plantão, no primeiro contato, com origem e
   código do episódio nas observações, até existir endpoint de escrita.
5. **Pedido ao Rafael (criador do ZXCRM), prioritário e com prazo de 2 semanas (texto em `docs/pedido-crm-rafael.md`):** (a) **integração nativa
   com o WhatsApp Business**, como a do Instagram, em que cada conversa nova vira
   card com origem; ou (b) endpoint de escrita para criar card (`POST`), com
   origem, responsável, telefone, observações e `metadata`, para o Make criar o
   card a partir da API oficial do WhatsApp; (c) endpoints de apoio (etapas,
   vendedores, origens, motivos), previstos no item 7 da documentação. A entrada
   nativa dos formulários da Meta já está confirmada pelo Fabio.

## 10. Medição

**Relatório semanal**, gerado com dados do Make e da API de leitura do ZXCRM
filtrada pelas origens do podcast:

| Métrica | Fonte |
|---|---|
| Leads por episódio e por canal | Make (captação) e código do episódio |
| Tempo até o primeiro contato | Formulários: Make (chegada) × card no CRM (`created_at`), cruzados pelo telefone. WhatsApp na fase 1: anotado pelo plantão no card. |
| Lead → reunião → proposta → ganho | ZXCRM (etapas e status por origem) |
| **Pipeline em mensalidade recorrente gerado** | ZXCRM (itens e valor por origem) |
| Alcance e retenção por corte | Instagram, YouTube e LinkedIn (snapshots do Make e painéis nativos) |
| Custo por conversa (anúncios) | Meta Ads (snapshot do Make) |

**Ritual:** 15 minutos por semana, com Fabio e os vendedores, sobre "leads sem
contato" e os temas que geraram lead ruim (motivos de perda).

**Meta dos primeiros 90 dias:** definir depois dos 3 primeiros episódios, a
partir da linha de base real. Meta inventada antes de ter dados vira ruído.

## 11. Regras e riscos

**Precisão (vale para episódio, corte, legenda e WhatsApp):**
- Rastreamento é **obrigação de meio**. Nunca prometer recuperação de veículo,
  pronta-resposta ou acionamento de autoridade.
- Caso do Rio: a solução está implantada **nos consórcios operadores** do Rio,
  que contrataram a Zirix individualmente. **Não dizer** "contratada pela SMTR".
- Vídeo não é vigilância humana contínua. ADAS e DMS têm falsos positivos e
  negativos.
- Claim de marketing (cobertura de 100%, 24/7) não vai para fala de episódio
  como garantia.
- Preço não aparece no podcast.

**Jurídico e LGPD (com a `zirix-legal`):**
- Termo de autorização de uso de imagem e voz do convidado, assinado antes de
  gravar.
- Autorização do cliente para gravar nas instalações e para mostrar frota,
  placas, telas de sistema e funcionários. Na dúvida, desfocar placa e tela.
- Consentimento registrado na isca e no WhatsApp, e saída imediata para quem
  pedir.
- Nada de disparo em massa pelo WhatsApp (risco de banimento do número).

**Segurança (pendências encontradas):**
- A chave da API do ZXCRM está em texto aberto nos cabeçalhos do cenário
  "CRM Cards → Snapshot", e a URL do webhook do Slack também está aberta. Pedir
  a rotação da chave e deixá-la só no cofre (keychain) do Make.
- Confirmar que o repositório `zirix-cockpit` é privado: ele recebe dados de
  contrato.

**Operação:**
- **Convidado desmarca:** gravar um "Zirix explica" de reserva por mês.
- **Calendário semanal:** só subir para semanal depois de 3 episódios
  quinzenais seguidos publicados no prazo e com o fluxo de pós-produção
  rodando em até 1 h de trabalho humano.

## 12. Abordagens consideradas para produção e edição

| Abordagem | Resultado |
|---|---|
| Corte ao vivo no OBS com computador | **Descartada.** Exige computador ligado às câmeras, inviável em garagem de cliente. |
| Edição tradicional (DaVinci Resolve) no computador | **Descartada como padrão.** De 4 a 8 h por episódio travam o semanal com dois apresentadores que também produzem. |
| Ferramenta paga de IA (Riverside, Opus Clip, vidIQ pago) | **Plano B.** Menos controle de marca e textos, e mensalidade. |
| **Dois iPhones gravando separado, lapelas com um canal por pessoa e pós-produção automatizada neste ambiente** | **Escolhida.** Funciona no estúdio e no cliente, sem custo de software e com pouco trabalho humano. |

## 13. Quem decidiu o quê

**Decidido pelo Fabio:** objetivo (leads e engajamento) · público (ônibus
urbano, intermunicipal e fretamento; Sudeste) · apresentadores (Fabio e Saulo)
· produção por eles, atendimento pelos vendedores · equipe comercial · ZXCRM
como CRM · anúncios na Meta · 2 iPhones (um estático, um móvel) · estúdio na
sala de reunião com logo e miniaturas · gravações e lives em clientes do Rio ·
fazer tudo por este ambiente.

**Decisões técnicas e de estratégia minhas (corrigíveis):** WhatsApp como porta
única · sem landing page · tipos de lead, prazos e cadência · régua de
prioridade para ônibus · divisão dos vendedores por segmento · plantão ·
quadros e calendário de publicação · stack de pós-produção · armazenamento
(Drive, HD, YouTube e Spotify) · lista de compras · câmera A em 4K · gravação
interna dos transmissores como fonte de áudio · pós-produção disparada numa
sessão do Claude, com duas aprovações · WhatsApp Business no aplicativo na
fase 1 e API oficial na fase 2 · dono por segmento com plantão só para triagem.

## 14. Fora deste documento (fica para o plano de implantação)

- Ordem exata de construção e testes da ferramenta de pós-produção.
- Identidade visual dos cortes (fonte, cores, cartela), seguindo a marca Zirix.
- Textos dos materiais de isca e das mensagens-modelo do WhatsApp.
- Configuração dos cenários do Make.

## 15. Pendências externas

| Pendência | Responsável |
|---|---|
| Comprar o kit de lapelas, os tripés e o HD | Fabio |
| Definir o 2º iPhone | Fabio e Saulo |
| Criar o número de WhatsApp Business do podcast | Fabio |
| Criar as origens e os motivos de perda no ZXCRM | Fabio |
| Enviar o pedido ao Rafael (`docs/pedido-crm-rafael.md`) | Fabio |
| Trocar a chave antiga do CRM no cofre do Make e revogá-la | Fabio |
| Termos de imagem e de gravação no cliente | `zirix-legal` |
| Criar o canal do YouTube e a conta no Spotify for Creators | Fabio ou Saulo |
| Liberar hosts e montar o setup do ambiente para a pós-produção | Claude, com aprovação do Fabio |
