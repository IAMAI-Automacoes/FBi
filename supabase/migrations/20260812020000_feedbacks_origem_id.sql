-- Agrupamento dos feedbacks que vieram da MESMA mensagem/interação do cliente.
--
-- O n8n pode quebrar um feedback do cliente em vários (ex.: "comida ótima, mas
-- demorou" → 1 ponto de comida + 1 de agilidade). Cada ponto vira uma linha com
-- seu próprio `id`, mas todos compartilham o mesmo `origem_id` — um uuid que o
-- n8n gera UMA vez por mensagem recebida e carimba em cada pedaço.
--
-- Para remontar o feedback original do cliente:
--   select * from feedbacks_restaurante where origem_id = '<uuid>' order by created_at;

alter table public.feedbacks_restaurante
  add column if not exists origem_id uuid;

comment on column public.feedbacks_restaurante.origem_id is
  'Liga os feedbacks extraídos da mesma mensagem do cliente. O n8n gera um uuid por feedback recebido e o repete em todos os pontos separados.';

-- Índice pra buscar rápido todos os pedaços de um mesmo feedback do cliente.
create index if not exists idx_feedbacks_origem_id
  on public.feedbacks_restaurante (origem_id);