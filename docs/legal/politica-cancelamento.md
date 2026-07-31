---
slug: politica_cancelamento
versao: "1.0"
titulo: "Política de Cancelamento e Reembolso"
vigente_desde: "A DEFINIR"
---

> **AVISO — ESTE DOCUMENTO É UMA MINUTA.** Precisa de revisão por advogado antes de entrar em produção.
> É a peça de maior risco jurídico do aplicativo: trata de retenção de valores em relação de consumo.
> Os percentuais abaixo são configuráveis no painel e devem ser validados com o jurídico.

# Política de Cancelamento e Reembolso

Esta política é apresentada a você **antes do pagamento** e aceita junto com a reserva. Ela vale tanto
para o pescador quanto para o guia.

---

## 1. Por que existe uma escala de retenção

A reserva é de **dia inteiro e exclusiva**. Quando você reserva uma data, ela sai do mercado: o guia
deixa de vendê-la a outro grupo e organiza equipe, combustível, isca e logística. Quanto mais perto da
data, menor a chance de a vaga ser revendida — e maior o prejuízo de quem se preparou.

Por isso a retenção **cresce conforme a data se aproxima**. Ela não é punição: é a estimativa do
prejuízo real, prefixada em contrato, como permitem os arts. 418 a 420 do Código Civil.

## 2. Escala de retenção — cancelamento pelo pescador

Os prazos são contados em dias corridos até a data da pescaria.

| Quando você cancela | Retenção | Você recebe de volta |
|---|---|---|
| **30 dias ou mais** antes | Apenas a taxa administrativa (**[5%]**) | 95% do valor pago |
| **15 a 29 dias** antes | **[25%]** do valor da reserva | o restante do que foi pago |
| **7 a 14 dias** antes | **[50%]** do valor da reserva | o restante do que foi pago |
| **3 a 6 dias** antes | **[75%]** do valor da reserva | o restante do que foi pago |
| **Menos de 48 horas** antes, ou não comparecimento | **[100%]** do valor da reserva | nada |

**Duas regras que protegem você:**

**2.1. A retenção nunca supera o que você já pagou.** Não haverá cobrança adicional depois do
cancelamento. Se você pagou apenas o sinal, o máximo que pode perder é o sinal.

**2.2. Se a data for revendida, você recebe mais de volta.** Cancelando, sua data volta para a lista de
espera. **Se outro grupo fechar a mesma data e a mesma embarcação, devolvemos o valor retido,
descontada apenas a taxa administrativa** — porque, nesse caso, o prejuízo não se concretizou. A
devolução é automática, em até **[7]** dias após a confirmação da nova reserva.

## 3. Alternativas antes de cancelar

Cancelar quase nunca é a melhor saída. Antes disso, o aplicativo oferece:

**3.1. Remarcar a data.** Solicitando com **[15]** dias ou mais de antecedência, você pode transferir a
reserva para outra data disponível do mesmo guia, **uma vez, sem custo**. Havendo diferença de preço,
ela é cobrada ou devolvida.

**3.2. Transferir a reserva para outra pessoa.** Até **[48 horas]** antes, sem custo, desde que o novo
titular aceite os termos e o termo de responsabilidade no aplicativo.

**3.3. Reduzir o número de participantes.** Até o prazo de quitação, com ajuste proporcional da parcela
por passageiro. O valor da embarcação não é reduzido.

## 4. Direito de arrependimento (7 dias)

Nos termos do **art. 49 do Código de Defesa do Consumidor**, por se tratar de contratação fora do
estabelecimento comercial, você pode **desistir em até 7 (sete) dias corridos** contados da reserva,
**com devolução integral de tudo o que pagou, inclusive a taxa administrativa**.

Esse direito prevalece sobre a escala da cláusula 2 e vale **desde que a pescaria ainda não tenha
ocorrido**. Reservas feitas a menos de 7 dias da data mantêm o direito até o momento do embarque.

## 5. Cancelamento pelo guia, clima e força maior

**5.1.** Se **o guia cancelar** por qualquer motivo que não seja clima ou determinação de autoridade,
você escolhe entre **nova data** ou **reembolso integral**, sem nenhuma retenção. O guia ainda responde
perante a plataforma pela penalidade prevista no contrato dele.

**5.2.** Se a pescaria for cancelada por **condição climática adversa, restrição de autoridade
competente, interdição do local ou outro caso fortuito ou de força maior**, você escolhe entre **nova
data** ou **reembolso integral**, sem retenção. Nenhuma das partes paga penalidade.

**5.3.** A decisão sobre condições de navegação é do guia e é **soberana**, por ser matéria de
segurança.

**5.4.** Se **você não puder ir por motivo de saúde** comprovado por atestado médico, apresentado em
até 5 dias, a retenção é reduzida a **[taxa administrativa apenas]**, e você pode optar por nova data.

## 6. Não pagamento do saldo

Não pago o saldo até a data limite da sua reserva, ela é **cancelada automaticamente** e aplica-se a
faixa da escala correspondente ao dia do vencimento. A data volta para a lista de espera, e a regra da
cláusula 2.2 continua valendo em seu favor.

## 7. Como o reembolso é feito

**7.1.** Pelo **mesmo meio de pagamento** usado na compra. Pix costuma cair em até 2 dias úteis; cartão
depende do banco emissor e pode levar até duas faturas.

**7.2.** O valor retido é dividido entre guia e plataforma na **mesma proporção da comissão** da
reserva.

**7.3.** A taxa administrativa cobre o custo do processamento do pagamento, que **não é devolvido pela
operadora** mesmo quando a compra é estornada.

## 8. Como pedir

Pelo próprio aplicativo, em **Minhas reservas → Cancelar**. Antes de confirmar, a tela mostra
**exatamente quanto você recebe de volta**. O pedido vale a partir do horário do registro no
aplicativo.

Dúvidas: **[E-MAIL]** · **[TELEFONE/WHATSAPP]**.

---

## Anexo técnico — para configuração no painel (não faz parte do texto ao cliente)

- As faixas são registradas em `cancellation_rules` e podem ter **override por guia**.
- A versão vigente é **congelada em `bookings.politica_versao`** no ato da reserva; alterações futuras não retroagem.
- A retenção é **limitada ao total efetivamente pago** (`min(retencao_calculada, total_pago)`).
- O estorno parcial no Mercado Pago devolve proporcionalmente da conta do guia e da comissão, mantendo o rateio automaticamente.
- A devolução por revenda da data (cláusula 2.2) é disparada pelo webhook de confirmação da nova reserva no mesmo `boat_id` + `data`.
- Não comparecimento é registrado pelo guia no check-in e tratado como cancelamento na faixa de menos de 48 horas.
