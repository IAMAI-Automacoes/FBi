-- Vínculo preciso ponto↔insight↔ação, e ciclo de vida do insight sem DELETE.
--
-- ## Os três problemas que isto resolve
--
-- 1. `insights.feedback_ids` guarda ids de feedbacks_originais (a MENSAGEM),
--    mas o insight é sobre um ASSUNTO, e uma mensagem carrega vários assuntos.
--    Medido: um original vira em média 2,25 pontos, de categorias diferentes
--    ("demorou 50 min" + "prato frio" + "ambiente bonito" na mesma mensagem).
--    Guardar o id do original é impreciso por construção — marca os três
--    assuntos como usados quando só um virou insight. A tabela nova guarda o
--    PONTO, que é a unidade certa.
--
-- 2. A interface conta `feedback_ids` (originais) mas lista os pontos, então
--    os números nunca batem. Com uma tabela só, contagem e listagem saem da
--    mesma fonte e não têm como divergir.
--
-- 3. Insight era APAGADO. O estrago está medido no banco agora: 33 ações e
--    ZERO com `insight_id` preenchido, porque a FK é ON DELETE SET NULL e o
--    botão "Gerar insights agora" apaga os insights não fixados a cada rodada.
--    Toda ação perdeu a origem. Daqui em diante insight não se apaga: ele é
--    desativado, marcado como excluído, ou marcado como "virou a ação X".

-- ---------------------------------------------------------------------------
-- 1. Vínculo durável ponto -> insight
-- ---------------------------------------------------------------------------

create table if not exists public.insight_feedback (
  insight_id              uuid   not null references public.insights(id)              on delete cascade,
  feedback_restaurante_id bigint not null references public.feedbacks_restaurante(id) on delete cascade,
  -- Redundante em relação a feedbacks_restaurante.origem_id, de propósito: é o
  -- que permite responder "quais clientes?" sem um join a mais, no caminho
  -- quente do motor de resposta.
  feedback_original_id    uuid,
  restaurante_id          bigint not null references public.restaurantes(id) on delete cascade,
  -- De onde veio o vínculo. 'vinculo_novo' é o feedback que chegou depois e foi
  -- anexado a um insight já existente.
  origem                  text not null default 'geracao'
    check (origem in ('geracao', 'vinculo_novo', 'manual')),
  created_at              timestamptz not null default now(),
  primary key (insight_id, feedback_restaurante_id)
);

create index if not exists idx_insight_feedback_ponto
  on public.insight_feedback (feedback_restaurante_id);
create index if not exists idx_insight_feedback_restaurante
  on public.insight_feedback (restaurante_id);

alter table public.insight_feedback enable row level security;

drop policy if exists tenant_isolation_select on public.insight_feedback;
create policy tenant_isolation_select on public.insight_feedback
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ---------------------------------------------------------------------------
-- 2. Ciclo de vida do insight
-- ---------------------------------------------------------------------------

alter table public.insights
  add column if not exists deletado_em         timestamptz,
  add column if not exists desativado_em       timestamptz,
  add column if not exists acao_id             bigint references public.acoes_operacionais(id) on delete set null,
  add column if not exists motivo_encerramento text;

do $$ begin
  alter table public.insights add constraint insights_motivo_encerramento_check
    check (motivo_encerramento in ('substituido', 'excluido', 'virou_acao'));
exception when duplicate_object then null; end $$;

-- O índice que a listagem da interface usa: só insight vivo.
create index if not exists idx_insights_vivos
  on public.insights (restaurante_id, created_at desc)
  where ativo and deletado_em is null;

-- ---------------------------------------------------------------------------
-- 3. feedback_acao ganha o ponto separado
-- ---------------------------------------------------------------------------
-- A PK era (feedback_original_id, acao_id) — sem lugar para o ponto. Trocada
-- por uma surrogate porque linha legada cujo ponto não existe mais precisa
-- caber, e um NULL não cabe em PK composta.

alter table public.feedback_acao
  add column if not exists feedback_restaurante_id bigint references public.feedbacks_restaurante(id) on delete cascade;

-- Troca da PK composta pela surrogate. Consulta o catálogo em vez de confiar
-- em código de exceção, para a migration poder ser reexecutada sem sustos.
do $troca_pk$
begin
  -- Só derruba a PK antiga se ela ainda for a composta.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.feedback_acao'::regclass
      and contype = 'p'
      and array_length(conkey, 1) = 2
  ) then
    alter table public.feedback_acao drop constraint feedback_acao_pkey;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback_acao' and column_name = 'id'
  ) then
    alter table public.feedback_acao add column id bigint generated always as identity;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.feedback_acao'::regclass and contype = 'p'
  ) then
    alter table public.feedback_acao add constraint feedback_acao_pkey primary key (id);
  end if;
end
$troca_pk$;

-- Idempotência do vínculo, nos dois regimes: por ponto (novo) e por original
-- (legado, quando o ponto é desconhecido).
create unique index if not exists feedback_acao_por_ponto
  on public.feedback_acao (acao_id, feedback_restaurante_id)
  where feedback_restaurante_id is not null;

create unique index if not exists feedback_acao_por_original
  on public.feedback_acao (acao_id, feedback_original_id)
  where feedback_restaurante_id is null;

create index if not exists idx_feedback_acao_ponto
  on public.feedback_acao (feedback_restaurante_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
-- Fonte: `feedbacks_restaurante.usado_por_insight_id`, que é o registro
-- PRECISO de qual ponto cada insight consumiu. Não usar `insights.feedback_ids`
-- aqui é deliberado: ele guarda o original, e expandi-lo para os pontos daquele
-- original inventaria vínculos com assuntos que o insight nunca tratou.

insert into public.insight_feedback
  (insight_id, feedback_restaurante_id, feedback_original_id, restaurante_id, origem)
select fr.usado_por_insight_id, fr.id, fr.origem_id, fr.restaurante_id, 'geracao'
from public.feedbacks_restaurante fr
join public.insights i on i.id = fr.usado_por_insight_id
where fr.usado_por_insight_id is not null
on conflict do nothing;

-- Mesma ideia do lado da ação: onde dá para saber o ponto exato, preenche.
update public.feedback_acao fa
set feedback_restaurante_id = fr.id
from public.feedbacks_restaurante fr
where fa.feedback_restaurante_id is null
  and fr.usado_por_acao_id = fa.acao_id
  and fr.origem_id = fa.feedback_original_id;

-- ---------------------------------------------------------------------------
-- 5. A definição ÚNICA de "feedback livre"
-- ---------------------------------------------------------------------------
-- Livre = não está preso por insight vivo NEM por ação existente.
--
-- "Ação existente" cobre arquivada de propósito: `feedback_acao` cascateia no
-- delete da ação, então a linha existir já significa que a ação existe. Ação
-- concluída ou arquivada continua segurando o feedback — só apagar a ação
-- libera.

create or replace view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where not exists (
        select 1
        from public.insight_feedback vi
        join public.insights i on i.id = vi.insight_id
        where vi.feedback_restaurante_id = fr.id
          and i.ativo
          and i.deletado_em is null)
  and not exists (
        select 1 from public.feedback_acao fa
        where fa.feedback_restaurante_id = fr.id
           -- Vínculo LEGADO: criado antes desta migration, sabe só o original.
           -- Continua segurando todos os pontos daquele original — impreciso,
           -- mas soltá-los faria o sistema re-levantar assunto que já virou
           -- ação. Some sozinho conforme as ações antigas saem de cena.
           or (fa.feedback_restaurante_id is null
               and fa.feedback_original_id = fr.origem_id));

-- ---------------------------------------------------------------------------
-- 6. As colunas denormalizadas viram CACHE da view
-- ---------------------------------------------------------------------------
-- `usado_em` / `usado_por_*` continuam existindo porque `gerar-insights` filtra
-- por elas (um índice parcial serve; um NOT EXISTS duplo não). Mas a verdade
-- passa a ser a view, e esta função reconstrói o cache a partir dela.
--
-- Existe porque são 6 transições (gerar, vincular, virar ação, desativar,
-- excluir, apagar ação) × 3 colunas, e o histórico deste projeto já registra
-- uma falha exatamente aí: 6 feedbacks ficaram presos para sempre por um
-- trigger AFTER que devia ser BEFORE.

create or replace function public.reconciliar_uso_feedbacks(p_restaurante_id bigint default null)
returns table (corrigidos bigint)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  with correto as (
    select fr.id,
           (select vi.insight_id
              from public.insight_feedback vi
              join public.insights i on i.id = vi.insight_id
             where vi.feedback_restaurante_id = fr.id
               and i.ativo and i.deletado_em is null
             order by vi.created_at
             limit 1) as insight_id,
           (select fa.acao_id
              from public.feedback_acao fa
             where fa.feedback_restaurante_id = fr.id
                or (fa.feedback_restaurante_id is null
                    and fa.feedback_original_id = fr.origem_id)
             order by fa.feedback_restaurante_id nulls last, fa.created_at
             limit 1) as acao_id
    from public.feedbacks_restaurante fr
    where p_restaurante_id is null or fr.restaurante_id = p_restaurante_id
  ),
  aplicado as (
    update public.feedbacks_restaurante fr
    set usado_por_insight_id = c.insight_id,
        usado_por_acao_id    = c.acao_id,
        -- Preserva o carimbo original quando o feedback continua preso; só
        -- zera de verdade quando ele voltou a ficar livre.
        usado_em = case
                     when c.insight_id is null and c.acao_id is null then null
                     else coalesce(fr.usado_em, now())
                   end
    from correto c
    where c.id = fr.id
      and (fr.usado_por_insight_id is distinct from c.insight_id
        or fr.usado_por_acao_id    is distinct from c.acao_id
        or (c.insight_id is null and c.acao_id is null) <> (fr.usado_em is null))
    returning 1
  )
  select count(*)::bigint from aplicado;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Triggers: marcar/liberar passam a seguir a tabela de vínculo
-- ---------------------------------------------------------------------------

-- ANTES: disparava em `insights AFTER INSERT` e expandia `feedback_ids` para
-- todos os pontos daquele original — o vínculo impreciso descrito no topo.
-- AGORA: dispara no vínculo em si, um ponto por vez. É o que faz "todos os
-- pontos do assunto ficam ligados" valer por construção.
create or replace function public.marcar_ponto_usado_por_insight()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.feedbacks_restaurante fr
  set usado_em             = coalesce(fr.usado_em, now()),
      usado_por_insight_id = coalesce(fr.usado_por_insight_id, new.insight_id)
  where fr.id = new.feedback_restaurante_id;
  return null;
end;
$fn$;

drop trigger if exists trg_insight_feedback_marcar on public.insight_feedback;
create trigger trg_insight_feedback_marcar
  after insert on public.insight_feedback
  for each row
  execute function public.marcar_ponto_usado_por_insight();

-- O trigger antigo sai: `insights.feedback_ids` deixa de comandar o estado de
-- uso. A coluna continua sendo preenchida por enquanto (compatibilidade), mas
-- não manda mais em nada.
drop trigger if exists trg_insights_marcar_feedbacks on public.insights;

-- Liberação por DESATIVAÇÃO ou EXCLUSÃO (o caminho novo, já que não há mais
-- DELETE). É AFTER UPDATE e pode ser: sem delete, não existe o ON DELETE SET
-- NULL que obrigava o trigger antigo a ser BEFORE.
--
-- O insight que virou AÇÃO é a exceção: os pontos não voltam para o pool, eles
-- migram para a ação (que já os prendeu via feedback_acao um instante antes).
create or replace function public.liberar_pontos_insight_encerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.motivo_encerramento = 'virou_acao' then
    return null;
  end if;

  update public.feedbacks_restaurante fr
  set usado_por_insight_id = null,
      usado_em = case when fr.usado_por_acao_id is null then null else fr.usado_em end
  where fr.usado_por_insight_id = new.id
    -- Ação viva ainda tratando o assunto mantém o feedback ocupado.
    and fr.usado_por_acao_id is null;

  return null;
end;
$fn$;

drop trigger if exists trg_insights_encerrado_libera on public.insights;
create trigger trg_insights_encerrado_libera
  after update on public.insights
  for each row
  when (
    (old.ativo is distinct from new.ativo and new.ativo = false)
    or (old.deletado_em is null and new.deletado_em is not null)
  )
  execute function public.liberar_pontos_insight_encerrado();

-- ANTES: copiava `unnest(insights.feedback_ids)` (originais) para feedback_acao.
-- AGORA: copia de `insight_feedback`, ponto a ponto — o que faz a ação herdar
-- exatamente os pontos do insight, nem mais nem menos.
create or replace function public.vincular_feedbacks_da_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.insight_id is null or new.restaurante_id is null then
    return null;
  end if;

  insert into public.feedback_acao
    (feedback_original_id, feedback_restaurante_id, acao_id, restaurante_id)
  select vi.feedback_original_id, vi.feedback_restaurante_id, new.id, new.restaurante_id
  from public.insight_feedback vi
  where vi.insight_id = new.insight_id
  on conflict do nothing;

  return null;
end;
$fn$;

-- Marca por PONTO quando ele é conhecido; cai no casamento por original só
-- para vínculo legado.
create or replace function public.marcar_feedback_usado_por_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.feedback_restaurante_id is not null then
    update public.feedbacks_restaurante fr
    set usado_em          = coalesce(fr.usado_em, now()),
        usado_por_acao_id = coalesce(fr.usado_por_acao_id, new.acao_id)
    where fr.id = new.feedback_restaurante_id;
  else
    update public.feedbacks_restaurante fr
    set usado_em          = coalesce(fr.usado_em, now()),
        usado_por_acao_id = coalesce(fr.usado_por_acao_id, new.acao_id)
    where fr.origem_id = new.feedback_original_id
      and fr.usado_por_acao_id is null;
  end if;
  return null;
end;
$fn$;

-- Reconcilia uma vez no fim da migration: o backfill acima mexeu em vínculo
-- sem passar pelos triggers.
select public.reconciliar_uso_feedbacks();
