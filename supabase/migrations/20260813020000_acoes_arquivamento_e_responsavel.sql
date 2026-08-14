-- 1) Arquivar ações concluídas.
--    O status continua 'CONCLUIDO' (a CHECK constraint de
--    20260418134333_schema_update.sql não muda, e o histórico de quando a ação
--    foi concluída é preservado). Arquivar é uma marca SEPARADA: o Kanban
--    esconde arquivadas, /acoes/arquivadas mostra só elas, e desarquivar é
--    voltar a coluna para NULL.
alter table public.acoes_operacionais
  add column if not exists arquivada_em timestamptz;

-- 2) Responsável e prazo.
--    O modal já coletava estes dois campos mas não havia onde gravar: o card
--    mostrava "Equipe" fixo e a data de criação. Agora passam a ser reais.
alter table public.acoes_operacionais
  add column if not exists responsavel text,
  add column if not exists prazo date;

create index if not exists idx_acoes_arquivada
  on public.acoes_operacionais (restaurante_id, arquivada_em);
