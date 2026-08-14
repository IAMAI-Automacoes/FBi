-- Nomes, fixação e pastas das conversas do chat interno.
--
-- Hoje o nome e o "fixada" de cada conversa vivem só no localStorage do
-- navegador (ChatFab.tsx): somem ao limpar o cache e não acompanham o dono em
-- outro aparelho. Estas tabelas passam a guardá-los no banco.
--
-- IMPORTANTE: `mensagens_chat` NÃO é tocada (escopo separado, CLAUDE.md). Uma
-- "conversa" continua sendo o agrupamento de mensagens por `sessao_id`; estas
-- tabelas são apenas os METADADOS dela. Sem linha aqui, a conversa continua
-- aparecendo no histórico com o preview da primeira mensagem — como hoje.
--
-- Dono: `restaurante_id` (bigint), como em todas as outras tabelas. NÃO usar
-- `usuario_id`: a tabela `usuarios` não existe mais e o FK de mensagens_chat
-- aponta para o vazio.

create table if not exists public.pastas_chat (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  nome           text   not null,
  ordem          int    not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.conversas_chat (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  -- Mesmo valor de mensagens_chat.sessao_id (text). Sem FK: mensagens_chat não
  -- tem unicidade em sessao_id e é intocável.
  sessao_id      text   not null,
  titulo         text,
  fixada         boolean not null default false,
  -- Apagar a pasta NÃO apaga as conversas: elas voltam para a raiz.
  pasta_id       uuid references public.pastas_chat(id) on delete set null,
  created_at     timestamptz not null default now(),
  atualizada_em  timestamptz not null default now(),
  constraint conversas_chat_sessao_unica unique (restaurante_id, sessao_id)
);

alter table public.pastas_chat    enable row level security;
alter table public.conversas_chat enable row level security;

drop policy if exists tenant_select_pastas_chat on public.pastas_chat;
drop policy if exists tenant_insert_pastas_chat on public.pastas_chat;
drop policy if exists tenant_update_pastas_chat on public.pastas_chat;
drop policy if exists tenant_delete_pastas_chat on public.pastas_chat;

create policy tenant_select_pastas_chat on public.pastas_chat
  for select to authenticated using (restaurante_id = public.get_user_restaurante_id());
create policy tenant_insert_pastas_chat on public.pastas_chat
  for insert to authenticated with check (restaurante_id = public.get_user_restaurante_id());
create policy tenant_update_pastas_chat on public.pastas_chat
  for update to authenticated using (restaurante_id = public.get_user_restaurante_id())
                                with check (restaurante_id = public.get_user_restaurante_id());
create policy tenant_delete_pastas_chat on public.pastas_chat
  for delete to authenticated using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_select_conversas_chat on public.conversas_chat;
drop policy if exists tenant_insert_conversas_chat on public.conversas_chat;
drop policy if exists tenant_update_conversas_chat on public.conversas_chat;
drop policy if exists tenant_delete_conversas_chat on public.conversas_chat;

create policy tenant_select_conversas_chat on public.conversas_chat
  for select to authenticated using (restaurante_id = public.get_user_restaurante_id());
create policy tenant_insert_conversas_chat on public.conversas_chat
  for insert to authenticated with check (restaurante_id = public.get_user_restaurante_id());
create policy tenant_update_conversas_chat on public.conversas_chat
  for update to authenticated using (restaurante_id = public.get_user_restaurante_id())
                                with check (restaurante_id = public.get_user_restaurante_id());
create policy tenant_delete_conversas_chat on public.conversas_chat
  for delete to authenticated using (restaurante_id = public.get_user_restaurante_id());

create index if not exists idx_conversas_chat_restaurante
  on public.conversas_chat (restaurante_id, fixada desc, atualizada_em desc);
create index if not exists idx_conversas_chat_pasta on public.conversas_chat (pasta_id);
create index if not exists idx_pastas_chat_restaurante
  on public.pastas_chat (restaurante_id, ordem, created_at);
