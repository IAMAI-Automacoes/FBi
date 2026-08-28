-- A regra de vinculo legado passa a respeitar o tempo.
--
-- ## O bug
--
-- `feedback_acao` tem 10 linhas antigas sem `feedback_restaurante_id` — vinculos
-- feitos quando a tabela so conhecia a mensagem original, antes de existir a
-- coluna do ponto. Para nao perde-las, a view `feedbacks_livres` e a funcao
-- `feedbacks_para_geracao` tratam como usado tambem:
--
--     fa.feedback_restaurante_id is null and fa.feedback_original_id = fr.origem_id
--
-- Ou seja: "esta mensagem original ja foi usada por uma acao". O problema e que
-- isso vale para TODO ponto daquela origem, inclusive os que ainda nem
-- existiam. Um cliente que ja teve uma acao criada no formato antigo e manda
-- uma mensagem nova hoje: o ponto novo nasce marcado como usado, some do pool,
-- e nunca vira insight. Ninguem percebe, porque nao ha erro — o feedback
-- simplesmente nao aparece.
--
-- Reproduzido em 2026-08-28: um feedback inserido agora, com origem numa
-- mensagem que tinha 4 vinculos legados, saiu da view no mesmo instante.
--
-- ## A correcao
--
-- A linha legada so pode cobrir pontos que JA EXISTIAM quando ela foi criada.
-- Um ponto criado depois nao pode ter sido a origem dela — e uma impossibilidade
-- temporal, nao uma heuristica.
--
-- Nao da para simplesmente preencher o `feedback_restaurante_id` das 10 linhas:
-- uma mensagem original vira varios pontos, e nao ha como saber a qual deles o
-- vinculo antigo se referia.

create or replace view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where not exists (
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

create or replace function public.reconciliar_uso_feedbacks(p_restaurante_id bigint default null::bigint)
returns table(corrigidos bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
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
                    and fa.feedback_original_id = fr.origem_id
                    and fr.created_at <= fa.created_at)
             order by fa.feedback_restaurante_id nulls last, fa.created_at
             limit 1) as acao_id
    from public.feedbacks_restaurante fr
    where p_restaurante_id is null or fr.restaurante_id = p_restaurante_id
  ),
  aplicado as (
    update public.feedbacks_restaurante fr
    set usado_por_insight_id = c.insight_id,
        usado_por_acao_id    = c.acao_id,
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
$$;
