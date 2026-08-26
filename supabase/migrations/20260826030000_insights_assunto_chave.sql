-- A chave do assunto que originou o insight (`tema:<uuid>|neg`, por exemplo).
--
-- Serve a duas coisas que sem ela exigiriam varrer insight_feedback ->
-- feedbacks_restaurante -> tema_id em toda geração:
--
--   1. Reincidência: "este mesmo assunto já teve insight encerrado nos últimos
--      30 dias?" pesa positivo no ranking, porque voltar depois de encerrado é
--      sinal de que a solução anterior não pegou.
--   2. Deduplicação: dois insights vivos sobre o mesmo assunto não deveriam
--      coexistir.
alter table public.insights
  add column if not exists assunto_chave text;

create index if not exists idx_insights_assunto
  on public.insights (restaurante_id, assunto_chave, desativado_em desc);
