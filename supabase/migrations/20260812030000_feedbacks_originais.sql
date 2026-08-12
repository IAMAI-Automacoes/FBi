-- Duas tabelas de feedback:
--   feedbacks_originais    → o feedback ORIGINAL do cliente (a mensagem inteira)
--   feedbacks_restaurante  → os feedbacks SEPARADOS (um ponto cada), que já
--                            existem; agora apontam para o original via origem_id
--
-- O n8n grava 1 linha em feedbacks_originais por mensagem recebida, pega o id
-- (uuid) dela e usa como origem_id em cada ponto separado gravado em
-- feedbacks_restaurante.

create table if not exists public.feedbacks_originais (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint references public.restaurantes(id) on delete cascade,
  telefone_cliente text,
  garcom_id      text,
  texto_original text,
  created_at     timestamptz not null default now()
);

alter table public.feedbacks_originais enable row level security;

-- Mesmo isolamento por restaurante das demais tabelas (o n8n usa service_role e
-- passa por cima da RLS; a RLS aqui protege o acesso pelo app).
create policy tenant_isolation_select on public.feedbacks_originais
  for select to authenticated using (restaurante_id = get_user_restaurante_id());
create policy tenant_isolation_insert on public.feedbacks_originais
  for insert to authenticated with check (restaurante_id = get_user_restaurante_id());
create policy tenant_isolation_update on public.feedbacks_originais
  for update to authenticated using (restaurante_id = get_user_restaurante_id())
  with check (restaurante_id = get_user_restaurante_id());
create policy tenant_isolation_delete on public.feedbacks_originais
  for delete to authenticated using (restaurante_id = get_user_restaurante_id());

create index if not exists idx_feedbacks_originais_restaurante
  on public.feedbacks_originais (restaurante_id, created_at desc);

-- Liga os separados ao original. origem_id já existia (uuid). Apagar o original
-- apaga os pontos separados dele (são um conjunto só).
alter table public.feedbacks_restaurante
  add constraint feedbacks_restaurante_origem_id_fkey
  foreign key (origem_id) references public.feedbacks_originais(id) on delete cascade;