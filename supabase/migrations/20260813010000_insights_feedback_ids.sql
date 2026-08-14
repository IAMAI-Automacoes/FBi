-- Liga cada insight aos feedbacks que realmente o originaram.
--
-- Até agora `insights.feedbacks_relacionados` era só um NÚMERO inventado pela
-- IA (gerar-insights/index.ts:198) — não dava para navegar até os feedbacks.
-- Passamos a guardar os IDs reais. O número continua existindo porque
-- `sugerir-acoes` o usa para ranquear; ele passa a ser derivado do tamanho de
-- feedback_ids, ou seja, deixa de ser mentira.
--
-- Os IDs são de `feedbacks_originais` (a MENSAGEM do cliente), que é o que a
-- página /feedbacks mostra via feedbacks_originais_view. A ponte é
-- feedbacks_restaurante.origem_id -> feedbacks_originais.id (ambos uuid).

alter table public.insights
  add column if not exists feedback_ids uuid[] not null default '{}';

-- Ação herda o vínculo do insight que a gerou → o botão "Feedbacks
-- Relacionados" na página de Ações leva aos MESMOS feedbacks.
alter table public.acoes_operacionais
  add column if not exists insight_id uuid references public.insights(id) on delete set null;

create index if not exists idx_acoes_insight on public.acoes_operacionais (insight_id);
create index if not exists idx_insights_feedback_ids on public.insights using gin (feedback_ids);
