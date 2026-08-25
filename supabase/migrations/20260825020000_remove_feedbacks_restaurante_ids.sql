-- Reverte a migration 20260824000000: aquelas colunas eram parte de um
-- esquema de dedup/vínculo que nunca chegou a ir pro ar. O que está rodando
-- de fato usa outro caminho — usado_em / usado_por_insight_id /
-- usado_por_acao_id em feedbacks_restaurante, mais a tabela feedback_acao,
-- tudo mantido por triggers (trg_insights_marcar_feedbacks,
-- trg_acoes_vincular_feedbacks etc.). Nada lê ou escreve estas colunas.
alter table public.insights
  drop column if exists feedbacks_restaurante_ids;

alter table public.acoes_operacionais
  drop column if exists feedback_ids,
  drop column if exists feedbacks_restaurante_ids;
