-- Vira lista de regras (era uma regra só por restaurante) — confirmado que
-- nenhum restaurante tinha configurado uma regra de verdade ainda (todos com
-- periodo_inicio null), então não há dado pra migrar, só resetar o formato.
alter table public.restaurantes
  alter column config_bonificacao set default '[]'::jsonb;

update public.restaurantes set config_bonificacao = '[]'::jsonb;

-- Pagamento por garçom vira um mapa {regra_id: data_do_pagamento}, já que
-- agora um garçom pode ter várias regras em aberto ao mesmo tempo.
alter table public.garcons
  add column if not exists bonus_pagamentos jsonb not null default '{}'::jsonb;

alter table public.garcons
  drop column if exists bonus_pago_em;
