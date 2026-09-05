-- Completa a lógica de `20260902000000_feedback_invalidado_por_exclusao.sql`:
-- o feedback invalidado por uma exclusão manual não gera insight sozinho, mas
-- a migration anterior só cobriu a METADE "não pode ser matéria-prima" — a
-- outra metade, "mas continua podendo ser vinculado a um insight novo que
-- outros feedbacks levantaram sobre o mesmo assunto", não tinha nenhum código
-- que a executasse: `gerar-insights` criava o insight e vinculava só os
-- pontos do agrupamento atual (`feedbacks_livres`, que exclui invalidado por
-- definição) — o relato antigo nunca voltava a aparecer.
--
-- Esta migration só abre espaço no schema para o vínculo novo se identificar
-- como tal (`origem = 'reaproveitado'`); o código que efetivamente busca os
-- invalidados do mesmo assunto e insere o vínculo mora em
-- `supabase/functions/gerar-insights/index.ts`, alterado junto.

alter table public.insight_feedback drop constraint if exists insight_feedback_origem_check;
alter table public.insight_feedback add constraint insight_feedback_origem_check
  check (origem in ('geracao', 'vinculo_novo', 'manual', 'reaproveitado'));

comment on column public.insight_feedback.origem is
  'De onde veio o vínculo. geracao = ponto do agrupamento que gerou o insight. vinculo_novo = feedback que chegou depois e foi anexado a um insight já existente. manual = vínculo feito à mão. reaproveitado = feedback invalidado por exclusão de um insight antigo, religado a um insight novo sobre o mesmo assunto.';
