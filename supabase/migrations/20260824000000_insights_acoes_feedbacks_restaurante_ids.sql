-- Vínculo fino por feedback SEPARADO (feedbacks_restaurante.id), complementar
-- ao feedback_ids (uuid[] de feedbacks_originais) que já existia — necessário
-- porque uma mensagem original pode virar mais de um feedback separado (ex.:
-- elogio + reclamação na mesma mensagem), e só marcar o original como "já
-- usado" seria impreciso: marcaria o pedaço errado (o elogio) como reservado
-- junto do pedaço que realmente virou insight (a reclamação).
--
-- acoes_operacionais ganha os DOIS arrays (não tinha nenhum): quando um
-- insight vira ação, os vínculos são transferidos pra cá e o insight é
-- apagado (ver sugerir-acoes/index.ts).
alter table public.insights
  add column if not exists feedbacks_restaurante_ids bigint[] not null default '{}';

alter table public.acoes_operacionais
  add column if not exists feedback_ids uuid[] not null default '{}',
  add column if not exists feedbacks_restaurante_ids bigint[] not null default '{}';
