-- Permite fixar uma ação no topo da coluna, por cima da ordenação automática
-- por prioridade (ver TaskBoard.tsx).
alter table public.acoes_operacionais
  add column if not exists fixado boolean not null default false;
