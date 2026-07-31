-- =============================================================================
-- Valores padrão da plataforma.
--
-- Todos são editáveis no painel do master — estão aqui apenas como ponto de
-- partida. Os números de negócio (comissão, preço do Diamond) ainda precisam
-- ser definidos; os que estão abaixo são os propostos em docs/PLANEJAMENTO.md.
-- =============================================================================

insert into public.app_settings (chave, valor, descricao) values
  ('comissao_padrao_percentual',   '10',    'Comissão da plataforma quando guia e barco não têm valor próprio'),
  ('sinal_percentual_padrao',      '30',    'Percentual do valor total cobrado como sinal'),
  ('prazo_quitacao_dias',          '7',     'Dias antes da pescaria em que o saldo vence'),
  ('taxa_administrativa_percentual','5',    'Retenção mínima em qualquer cancelamento'),
  ('reserva_expira_minutos',       '20',    'Tempo que a reserva não paga segura a data'),
  ('arrependimento_dias',          '7',     'Art. 49 do CDC: devolução integral neste prazo'),
  ('remarcacao_antecedencia_dias', '15',    'Antecedência mínima para remarcar sem custo'),
  ('transferencia_titular_horas',  '48',    'Até quantas horas antes é possível transferir a reserva'),
  ('diamond_dias_antecipacao',     '14',    'Dias de agenda exclusiva para membros Diamond'),
  ('diamond_preco_anual_centavos', 'null',  'A DEFINIR — preço anual do plano Diamond'),
  ('previsao_dias_antecedencia',   '7',     'A partir de quantos dias antes a previsão do tempo aparece'),
  ('avaliacao_nota_alerta',        '3',     'Nota igual ou menor dispara alerta para o master'),
  ('checklist_padrao',
   '"Documento com foto, protetor solar, boné, água, remédio de uso contínuo e roupa de troca."',
   'Texto do lembrete D-3; cada guia pode sobrescrever'),
  ('ponto_encontro_padrao',
   '"A combinar com o guia — confira no lembrete de véspera."',
   'Texto do lembrete D-1; cada guia pode sobrescrever')
on conflict (chave) do nothing;

-- =============================================================================
-- Escala de retenção padrão (guide_id nulo = vale para toda a plataforma).
-- Guias podem ter faixas próprias; ver docs/legal/politica-cancelamento.md.
-- =============================================================================

insert into public.cancellation_rules (guide_id, dias_min, dias_max, retencao_percentual, ordem) values
  (null, 30, null, 5,   1),   -- 30 dias ou mais: só a taxa administrativa
  (null, 15,   29, 25,  2),
  (null,  7,   14, 50,  3),
  (null,  3,    6, 75,  4),
  (null,  0,    2, 100, 5);   -- menos de 48h ou não comparecimento
