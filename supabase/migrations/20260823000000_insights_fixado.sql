-- Permite fixar um insight no topo da lista, por cima da ordenação por data
-- de criação (mesmo padrão de acoes_operacionais.fixado, ver migration
-- 20260822000000_acoes_fixado.sql).
alter table public.insights
  add column if not exists fixado boolean not null default false;
