-- "Liberdade condicional" é LIVRE, com uma exceção só, nas palavras do dono:
-- "ele tá livre, mas não é lido quando uma IA vai gerar novos insights".
--
-- Até aqui a view `feedbacks_livres` excluía os condicionais por inteiro. Ela é
-- lida também pela criação de ação (`categorizar-acao`, que liga à ação nova os
-- feedbacks do mesmo tema) e pela conversão de insight em ação (`sugerir-acoes`)
-- — nenhuma das duas gera insight. O condicional passa a aparecer nelas.
--
-- A exceção continua onde ela vale: `feedbacks_para_geracao` segue ignorando
-- os condicionais, e `deve_gerar_insights` deixa de contá-los — eles não servem
-- de base para a rodada, então também não podem ser o que a dispara.
create or replace view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where fr.triado_em is not null
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

create or replace function public.deve_gerar_insights(p_restaurante_id bigint)
returns table(deve boolean, livres_novos bigint, necessarios integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cfg as (
    select
      least(greatest(
        coalesce((r.config_insights ->> 'feedbacks_por_analise')::int, 6),
      3), 30) as necessarios,
      coalesce(r.ultima_analise_insights, '-infinity'::timestamptz) as marco
    from public.restaurantes r
    where r.id = p_restaurante_id
      and r.excluida_em is null
  ),
  contagem as (
    select count(*) as livres
    from public.feedbacks_livres f, cfg
    where f.restaurante_id = p_restaurante_id
      and f.created_at > cfg.marco
      and f.invalidado_em is null
  )
  select contagem.livres >= cfg.necessarios, contagem.livres, cfg.necessarios
  from cfg, contagem;
$function$;
