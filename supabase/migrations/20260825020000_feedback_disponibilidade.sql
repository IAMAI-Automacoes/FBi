-- Impede que o mesmo feedback gere insight ou ação repetidos.
--
-- Comportamento até aqui: `gerar-insights` seleciona feedbacks por JANELA DE
-- TEMPO (created_at >= ultima_analise_insights, index.ts:89-91). Um feedback
-- podia entrar em vários ciclos e render insights praticamente idênticos, e o
-- dono via a mesma reclamação virar tarefa duas vezes.
--
-- Passa a existir um estado explícito: o feedback está DISPONÍVEL (usado_em
-- nulo) ou JÁ FOI CONSUMIDO por um insight/ação. `gerar-insights` só olha os
-- disponíveis.
--
-- A liberação é a outra metade da regra: se o insight ou a ação que consumiu o
-- feedback for EXCLUÍDO, o feedback volta a ficar disponível — o assunto
-- claramente não foi tratado, então precisa poder ser levantado de novo.
--
-- Nota sobre exclusão vs. desativação: `gerar-insights` marca insights antigos
-- como ativo=false (index.ts:222-224) em vez de apagá-los. Isso NÃO libera o
-- feedback, e é proposital — o insight continua existindo e continua
-- representando aquele feedback. Só o DELETE de verdade libera.

alter table public.feedbacks_restaurante
  add column if not exists usado_em             timestamptz,
  add column if not exists usado_por_insight_id uuid   references public.insights(id)           on delete set null,
  add column if not exists usado_por_acao_id    bigint references public.acoes_operacionais(id) on delete set null;

-- Índice parcial: a varredura de `gerar-insights` passa a ser "os disponíveis
-- deste restaurante", e só essas linhas entram no índice.
create index if not exists idx_feedbacks_disponiveis
  on public.feedbacks_restaurante (restaurante_id, created_at)
  where usado_em is null;

-- Marca como usados os feedbacks (pedaços) cujo ORIGINAL entrou num insight.
--
-- A ponte de id-space: insights.feedback_ids guarda ids de feedbacks_originais
-- (a mensagem), enquanto quem carrega o estado de uso é feedbacks_restaurante
-- (os pedaços). A ligação é feedbacks_restaurante.origem_id.
create or replace function public.marcar_feedbacks_usados_insight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.feedback_ids is null or array_length(new.feedback_ids, 1) is null then
    return null;
  end if;

  update public.feedbacks_restaurante fr
  set usado_em             = coalesce(fr.usado_em, now()),
      usado_por_insight_id = coalesce(fr.usado_por_insight_id, new.id)
  where fr.origem_id = any (new.feedback_ids)
    and fr.usado_em is null;

  return null;
end;
$$;

drop trigger if exists trg_insights_marcar_feedbacks on public.insights;
create trigger trg_insights_marcar_feedbacks
  after insert on public.insights
  for each row
  execute function public.marcar_feedbacks_usados_insight();

-- Libera os feedbacks quando o insight é EXCLUÍDO.
--
-- É BEFORE DELETE, não AFTER, e isso é essencial: a FK usado_por_insight_id é
-- ON DELETE SET NULL, e o Postgres aplica esse SET NULL *antes* de um AFTER
-- DELETE rodar. Num AFTER, o `where usado_por_insight_id = old.id` não acharia
-- mais nenhuma linha — e o feedback ficaria com usado_em preenchido e nenhum
-- dono apontando para ele: travado para sempre, invisível para gerar-insights.
-- (Verificado na prática: com AFTER, 6 feedbacks ficaram presos nesse estado.)
create or replace function public.liberar_feedbacks_insight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedbacks_restaurante fr
  set usado_em             = null,
      usado_por_insight_id = null
  where fr.usado_por_insight_id = old.id
    -- Se uma AÇÃO também consumiu este feedback, ele continua indisponível:
    -- a ação segue viva e tratando o assunto.
    and fr.usado_por_acao_id is null;

  return old;
end;
$$;

drop trigger if exists trg_insights_liberar_feedbacks on public.insights;
create trigger trg_insights_liberar_feedbacks
  before delete on public.insights
  for each row
  execute function public.liberar_feedbacks_insight();

-- Do lado da AÇÃO o gancho fica em feedback_acao, não em acoes_operacionais.
-- Motivo: no AFTER INSERT da ação o vínculo ainda pode não existir (ele é
-- criado por outra trigger do mesmo evento, e a ordem entre triggers de mesmo
-- evento é alfabética pelo nome — frágil demais para depender). Reagindo ao
-- vínculo, dispara-se exatamente quando existe o que marcar, venha ele da
-- edge function `sugerir-acoes` ou da trigger de fallback.
create or replace function public.marcar_feedback_usado_por_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedbacks_restaurante fr
  set usado_em          = coalesce(fr.usado_em, now()),
      usado_por_acao_id = coalesce(fr.usado_por_acao_id, new.acao_id)
  where fr.origem_id = new.feedback_original_id
    and fr.usado_por_acao_id is null;

  return null;
end;
$$;

drop trigger if exists trg_feedback_acao_marcar on public.feedback_acao;
create trigger trg_feedback_acao_marcar
  after insert on public.feedback_acao
  for each row
  execute function public.marcar_feedback_usado_por_vinculo();

create or replace function public.liberar_feedbacks_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedbacks_restaurante fr
  set usado_por_acao_id = null,
      -- Só volta a ficar disponível se nenhum insight vivo ainda o segura.
      usado_em = case when fr.usado_por_insight_id is null then null else fr.usado_em end
  where fr.usado_por_acao_id = old.id;

  return old;
end;
$$;

-- Mesmo motivo do insight: BEFORE, para rodar antes do SET NULL da FK.
drop trigger if exists trg_acoes_liberar_feedbacks on public.acoes_operacionais;
create trigger trg_acoes_liberar_feedbacks
  before delete on public.acoes_operacionais
  for each row
  execute function public.liberar_feedbacks_acao();

-- Backfill: o que já foi consumido por um insight existente entra como usado,
-- senão o primeiro ciclo depois desta migration trataria tudo como novo e
-- regeraria os mesmos insights — exatamente o que estamos evitando.
update public.feedbacks_restaurante fr
set usado_em             = coalesce(fr.usado_em, i.created_at, now()),
    usado_por_insight_id = coalesce(fr.usado_por_insight_id, i.id)
from public.insights i
where fr.origem_id = any (i.feedback_ids)
  and fr.usado_em is null;
