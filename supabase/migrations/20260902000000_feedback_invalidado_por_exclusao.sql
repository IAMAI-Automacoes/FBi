-- Excluir um insight INVALIDA os feedbacks dele em vez de devolvê-los ao pool.
--
-- ## O que mudou na regra
--
-- Até aqui, excluir um insight liberava os pontos: `usado_em` voltava a null e
-- eles entravam na próxima rodada de geração como se nunca tivessem sido
-- analisados. O resultado prático é que o dono excluía o insight e a IA o
-- recriava na rodada seguinte, com outras palavras — o mesmo assunto voltava, e
-- a exclusão parecia não ter efeito nenhum.
--
-- A regra nova separa as duas coisas que "livre" significava:
--
--   MATÉRIA-PRIMA  — pode ser usado para CRIAR um insight novo.
--   VINCULÁVEL     — pode ser GRUDADO num insight/ação que já existe.
--
-- Excluir o insight tira só a primeira. O feedback fica invalidado: não gera
-- mais nada sozinho, mas continua podendo ser ligado a um insight novo que
-- outros feedbacks (válidos) levantaram sobre o mesmo assunto. Se o assunto
-- volta a aparecer por conta própria, o relato antigo entra junto — e o cliente
-- que reclamou naquela vez volta a ser alcançável pelo motor de resposta.
--
-- ## `timestamptz`, não `boolean`
--
-- O resto do ciclo de vida deste schema é datado (`usado_em`, `deletado_em`,
-- `desativado_em`, `arquivada_em`) e a leitura é sempre `is null` / `is not
-- null`. Um booleano daria a mesma resposta e perderia o "quando", que é o que
-- permite auditar depois "este feedback sumiu da análise por quê, e desde
-- quando".
--
-- ## O gancho é UPDATE, não DELETE
--
-- Insight NUNCA é apagado do banco: `Insights.tsx` marca `deletado_em` +
-- `motivo_encerramento='excluido'` (o `delete()` que existia lá foi removido
-- porque apagava, por FK on delete set null, a origem das ações nascidas do
-- insight). Pendurar isto num BEFORE DELETE não dispararia nunca.
--
-- E dispara SÓ em `excluido`. O mesmo trigger de encerramento também roda em:
--   - `substituido` — rodada nova aposentando a antiga; o assunto continua
--     válido, os pontos precisam voltar ao pool.
--   - `virou_acao`  — quem segura os pontos passa a ser a ação.
-- Invalidar nesses dois casos apagaria da análise feedback perfeitamente bom.

alter table public.feedbacks_restaurante
  add column if not exists invalidado_em timestamptz;

comment on column public.feedbacks_restaurante.invalidado_em is
  'Quando o dono excluiu o insight que representava este feedback. Invalidado = não serve mais de matéria-prima para GERAR insight, mas continua podendo ser VINCULADO a insight/ação existentes.';

-- O índice parcial de disponibilidade passa a excluir os invalidados: eles não
-- são mais candidatos a nada que varra "o que está livre para gerar".
drop index if exists idx_feedbacks_disponiveis;
create index if not exists idx_feedbacks_disponiveis
  on public.feedbacks_restaurante (restaurante_id, created_at)
  where usado_em is null and invalidado_em is null;

-- ---------------------------------------------------------------------------
-- 1. Encerramento: liberar OU invalidar, conforme o motivo
-- ---------------------------------------------------------------------------
-- Substitui `liberar_pontos_insight_encerrado` (20260826010000). O corpo antigo
-- está preservado no caminho de baixo: para `substituido` o comportamento é
-- exatamente o de antes.
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

  if new.motivo_encerramento = 'excluido' then
    -- Exclusão à mão: o ponto sai do pool de geração e fica marcado.
    --
    -- `usado_por_insight_id` é zerado junto porque o insight morreu: deixá-lo
    -- apontando para um insight excluído travaria o ponto no cache de uso (foi
    -- assim que 6 feedbacks ficaram presos para sempre em 2026-08-25). Quem
    -- impede o reaproveitamento agora é `invalidado_em`, não `usado_em`.
    --
    -- O alvo sai de `insight_feedback`, não de `usado_por_insight_id`: um ponto
    -- pode estar ligado a este insight sem ser ele quem o "segura" no cache
    -- (vínculo criado por `vincular-feedback` depois de outro insight já ter
    -- marcado o ponto). Excluir o insight tem que invalidar tudo que ele
    -- representava, não só a parcela que aparecia no cache.
    --
    -- Ação viva ainda tratando o assunto é a exceção: aí o assunto não foi
    -- descartado, foi promovido, e o ponto continua em uso legítimo.
    --
    -- `is not distinct from` e não `=`: o ponto pode estar ligado a este
    -- insight com `usado_por_insight_id` NULL (o cache aponta para outro dono,
    -- ou para nenhum). Com `=`, a comparação daria NULL, o CASE cairia no ELSE
    -- e o ponto ficaria com `usado_em` preenchido sem dono nenhum — o mesmo
    -- estado travado que custou 6 feedbacks em 2026-08-25.
    update public.feedbacks_restaurante fr
    set invalidado_em        = coalesce(fr.invalidado_em, now()),
        usado_por_insight_id = nullif(fr.usado_por_insight_id, new.id),
        usado_em             = case
                                 when fr.usado_por_insight_id is not distinct from new.id then null
                                 else fr.usado_em
                               end
    where fr.usado_por_acao_id is null
      and exists (
        select 1 from public.insight_feedback vi
        where vi.insight_id = new.id
          and vi.feedback_restaurante_id = fr.id
      );

    return null;
  end if;

  -- Substituição por rodada nova: comportamento original, devolve ao pool.
  update public.feedbacks_restaurante fr
  set usado_por_insight_id = null,
      usado_em = case when fr.usado_por_acao_id is null then null else fr.usado_em end
  where fr.usado_por_insight_id = new.id
    and fr.usado_por_acao_id is null;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Vínculo novo NÃO revalida — e isso é deliberado
-- ---------------------------------------------------------------------------
-- `invalidado_em` fica onde está quando o ponto é grudado num insight novo. Se
-- esse insight também for excluído, o ponto já está marcado e nada muda; se ele
-- virar ação, quem passa a segurá-lo é `usado_por_acao_id`, que tem precedência
-- em todo lugar que consulta.
--
-- Limpar a marca no vínculo reabriria a porta: bastaria o ponto ser vinculado a
-- um insight e esse insight ser SUBSTITUÍDO por uma rodada nova para ele voltar
-- ao pool como matéria-prima do assunto que o dono mandou embora.

-- ---------------------------------------------------------------------------
-- 3. A view e a função de geração passam a ignorar os invalidados
-- ---------------------------------------------------------------------------
-- `feedbacks_livres` é lida por `deve_gerar_insights` (o gatilho por contagem).
-- Um invalidado não pode disparar rodada nem entrar nela — as duas leituras
-- querem o mesmo corte, então ele entra na própria view.
--
-- Atenção ao que NÃO muda: `vincular-feedback` lê `feedbacks_restaurante`
-- direto, sem passar por aqui. É exatamente isso que mantém o invalidado
-- vinculável a insight e ação novos.
--
-- É DROP + CREATE, e não o `create or replace` das migrations anteriores. A
-- view é `select fr.*`, e o ALTER TABLE lá em cima acabou de acrescentar
-- `invalidado_em` à tabela — então a lista de colunas da view MUDA nesta
-- migration, e `create or replace view` só aceita acrescentar colunas no FIM
-- da lista existente, recusando qualquer outra diferença com "cannot change
-- name of view column". Nenhuma outra view depende desta (`deve_gerar_insights`
-- é função, e função não é dependência registrada), então o DROP é seguro.
drop view if exists public.feedbacks_livres;
create view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where fr.invalidado_em is null
  and not exists (
        select 1 from public.insight_feedback vi
        join public.insights i on i.id = vi.insight_id
        where vi.feedback_restaurante_id = fr.id
          and i.ativo and i.deletado_em is null)
  and not exists (
        select 1 from public.feedback_acao fa
        where fa.feedback_restaurante_id = fr.id
           or (fa.feedback_restaurante_id is null
               and fa.feedback_original_id = fr.origem_id
               and fr.created_at <= fa.created_at));

create or replace function public.feedbacks_para_geracao(
  p_restaurante_id bigint,
  p_dias integer default 14
)
returns setof public.feedbacks_restaurante
language sql
stable
security definer
set search_path to 'public'
as $$
  select fr.*
  from public.feedbacks_restaurante fr
  where fr.restaurante_id = p_restaurante_id
    and fr.created_at >= now() - make_interval(days => p_dias)
    and fr.invalidado_em is null
    and not exists (
      select 1 from public.feedback_acao fa
      where fa.feedback_restaurante_id = fr.id
         or (fa.feedback_restaurante_id is null
             and fa.feedback_original_id = fr.origem_id
             and fr.created_at <= fa.created_at))
    and not exists (
      select 1 from public.insight_feedback vi
      join public.insights i on i.id = vi.insight_id
      where vi.feedback_restaurante_id = fr.id
        and i.ativo
        and i.deletado_em is null
        and coalesce(i.fixado, false) = true)
$$;

-- ---------------------------------------------------------------------------
-- 4. A reconciliação não pode ressuscitar invalidado
-- ---------------------------------------------------------------------------
-- `reconciliar_uso_feedbacks` reconstrói o cache (`usado_em`/`usado_por_*`) a
-- partir dos vínculos vivos, e roda ao fim de toda rodada de geração. A leitura
-- ingênua ("reconciliar libera tudo") sugere que ela desfaria a invalidação —
-- não desfaz, e vale registrar por quê: `usado_em = null` é o estado CERTO de
-- um invalidado (ele de fato não está preso a nada). O que precisa sobreviver é
-- a marca, e ela mora numa coluna que esta função não toca.
--
-- Nada a alterar aqui, portanto. A nota fica no lugar onde a dúvida aparece.

-- ---------------------------------------------------------------------------
-- 5. Backfill: insights já excluídos
-- ---------------------------------------------------------------------------
-- Quem excluiu um insight ANTES desta migration teve os pontos devolvidos ao
-- pool. Sem isto, a primeira rodada depois do deploy recriaria exatamente os
-- insights que o dono já tinha mandado embora — o bug que esta migration existe
-- para fechar, disparado uma última vez pelo próprio deploy.
--
-- Só pontos que hoje não estão presos a nada vivo: se o ponto já foi
-- reaproveitado por um insight ativo ou por uma ação, ele está em uso legítimo
-- e não deve ser marcado.
update public.feedbacks_restaurante fr
set invalidado_em = coalesce(fr.invalidado_em, i.deletado_em, now())
from public.insights i
join public.insight_feedback vi on vi.insight_id = i.id
where vi.feedback_restaurante_id = fr.id
  and i.deletado_em is not null
  and i.motivo_encerramento = 'excluido'
  and fr.invalidado_em is null
  and fr.usado_por_acao_id is null
  and not exists (
    select 1
    from public.insight_feedback vi2
    join public.insights i2 on i2.id = vi2.insight_id
    where vi2.feedback_restaurante_id = fr.id
      and i2.ativo and i2.deletado_em is null);
