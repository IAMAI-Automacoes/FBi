-- Vínculo N:N materializado entre a MENSAGEM do cliente e a AÇÃO operacional.
--
-- O problema que isto resolve: hoje a única ligação entre uma ação e as pessoas
-- que a motivaram é indireta e frágil —
--
--     acoes_operacionais.insight_id -> insights.feedback_ids[] -> feedbacks_originais.id
--
-- e `insight_id` é ON DELETE SET NULL (migration 20260813010000). Ou seja:
-- apagar um insight na tela de Insights zera o insight_id das ações que ele
-- gerou, e o vínculo com os feedbacks se perde PARA SEMPRE. A ação continua no
-- quadro, mas ninguém mais sabe quem reclamou daquilo.
--
-- Para exibir um botão "feedbacks relacionados" isso é um incômodo. Para MANDAR
-- MENSAGEM é fatal: sem saber a origem, o motor não tem destinatário.
--
-- Por isso o vínculo passa a ser uma linha própria, com CASCADE dos dois lados:
-- some junto com a ação ou com o feedback (aí não há mais o que avisar), mas
-- sobrevive a qualquer coisa que aconteça com o insight intermediário.

create table if not exists public.feedback_acao (
  feedback_original_id uuid   not null references public.feedbacks_originais(id) on delete cascade,
  acao_id              bigint not null references public.acoes_operacionais(id)  on delete cascade,
  restaurante_id       bigint not null references public.restaurantes(id)        on delete cascade,
  created_at           timestamptz not null default now(),
  primary key (feedback_original_id, acao_id)
);

-- A consulta quente do motor é "quais feedbacks alimentaram esta ação?", que
-- ataca pela segunda coluna da PK — daí o índice dedicado.
create index if not exists idx_feedback_acao_acao
  on public.feedback_acao (acao_id);

create index if not exists idx_feedback_acao_restaurante
  on public.feedback_acao (restaurante_id);

alter table public.feedback_acao enable row level security;

drop policy if exists tenant_isolation_select on public.feedback_acao;
create policy tenant_isolation_select on public.feedback_acao
  for select using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_isolation_insert on public.feedback_acao;
create policy tenant_isolation_insert on public.feedback_acao
  for insert with check (restaurante_id = public.get_user_restaurante_id());

drop policy if exists tenant_isolation_delete on public.feedback_acao;
create policy tenant_isolation_delete on public.feedback_acao
  for delete using (restaurante_id = public.get_user_restaurante_id());

-- Rede de segurança: se a ação nascer com insight_id preenchido e ninguém
-- tiver populado o vínculo explicitamente, copia de insights.feedback_ids.
--
-- A edge function `sugerir-acoes` popula isto diretamente (é o caminho normal e
-- o que dá controle sobre erro). Esta trigger cobre os outros caminhos: ação
-- criada à mão pela UI a partir de um insight, importação, correção manual.
-- O ON CONFLICT DO NOTHING torna as duas rotas idempotentes entre si.
create or replace function public.vincular_feedbacks_da_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.insight_id is null or new.restaurante_id is null then
    return null;
  end if;

  insert into public.feedback_acao (feedback_original_id, acao_id, restaurante_id)
  select fid, new.id, new.restaurante_id
  from public.insights i
  cross join lateral unnest(i.feedback_ids) as fid
  where i.id = new.insight_id
    -- Só ids que ainda existem: um feedback apagado violaria o FK e derrubaria
    -- a criação da ação inteira.
    and exists (select 1 from public.feedbacks_originais fo where fo.id = fid)
  on conflict do nothing;

  return null;
end;
$$;

drop trigger if exists trg_acoes_vincular_feedbacks on public.acoes_operacionais;
create trigger trg_acoes_vincular_feedbacks
  after insert on public.acoes_operacionais
  for each row
  execute function public.vincular_feedbacks_da_acao();

-- Backfill das ações existentes, pela mesma regra.
insert into public.feedback_acao (feedback_original_id, acao_id, restaurante_id)
select fid, a.id, a.restaurante_id
from public.acoes_operacionais a
join public.insights i on i.id = a.insight_id
cross join lateral unnest(i.feedback_ids) as fid
where a.restaurante_id is not null
  and exists (select 1 from public.feedbacks_originais fo where fo.id = fid)
on conflict do nothing;
