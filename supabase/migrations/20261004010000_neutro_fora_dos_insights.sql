-- Neutro não gera insight; Sugestão gera, como ponto a melhorar.
-- (Decisão do Raver, 04/10/2026, junto com o workflow novo do n8n.)
--
-- O ponto Neutro ("o ambiente foi razoável") passa a ser gravado pelo n8n e
-- aparece no painel como feedback, mas NÃO é lido para gerar insight: não
-- conta no gatilho da análise (deve_gerar_insights, via feedbacks_livres) nem
-- entra na geração (feedbacks_para_geracao). Ponto sem sentimento também
-- fica de fora.
--
-- A mesma regra existe no código: supabase/functions/_shared/sentimento.ts
-- (entraEmInsight). Se mudar aqui, mude lá — e vice-versa.

create or replace view public.feedbacks_livres
with (security_invoker = true) as
 select fr.id,
    fr.created_at,
    fr.texto_original,
    fr.categoria,
    fr.sentimento,
    fr.resumo,
    fr.telefone_cliente,
    fr.restaurante_id,
    fr.origem_id,
    fr.tema_id,
    fr.usado_em,
    fr.usado_por_insight_id,
    fr.usado_por_acao_id,
    fr.contato_id,
    fr.invalidado_em,
    fr.triado_em
   from public.feedbacks_restaurante fr
  where fr.triado_em is not null
    -- Só elogio, queixa (inclui o misto) e sugestão alimentam insight.
    and (fr.sentimento ilike '%positiv%' or fr.sentimento ilike '%negativ%' or fr.sentimento ilike '%sugest%')
    and not (exists ( select 1
           from public.insight_feedback vi
             join public.insights i on i.id = vi.insight_id
          where vi.feedback_restaurante_id = fr.id and i.ativo and i.deletado_em is null))
    and not (exists ( select 1
           from public.feedback_acao fa
          where fa.feedback_restaurante_id = fr.id
             or fa.feedback_restaurante_id is null and fa.feedback_original_id = fr.origem_id and fr.created_at <= fa.created_at));

create or replace function public.feedbacks_para_geracao(p_restaurante_id bigint, p_dias integer default 14)
returns setof public.feedbacks_restaurante
language sql
stable security definer
set search_path to 'public'
as $function$
  select fr.*
  from public.feedbacks_restaurante fr
  where fr.restaurante_id = p_restaurante_id
    and fr.created_at >= now() - make_interval(days => p_dias)
    and fr.triado_em is not null
    and fr.invalidado_em is null
    -- Neutro não gera insight (ver o cabeçalho).
    and (fr.sentimento ilike '%positiv%' or fr.sentimento ilike '%negativ%' or fr.sentimento ilike '%sugest%')
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
        and i.deletado_em is null)
$function$;

comment on column public.feedbacks_restaurante.sentimento is
  'Sentimento do ponto: Positivo | Negativo | Neutro | Sugestão (linhas antigas em minúscula). Neutro não gera insight; Sugestão gera como ponto a melhorar.';
comment on column public.feedbacks_originais.sentimento is
  'Sentimento da mensagem inteira: Positivo | Negativo | Positivo e Negativo | Neutro | Sugestão (calculado pelo n8n a partir dos pontos).';
