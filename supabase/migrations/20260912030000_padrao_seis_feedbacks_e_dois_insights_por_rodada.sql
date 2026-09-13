-- A mesma configuração tinha três padrões diferentes, dependendo de quem
-- perguntava: a coluna nascia com 10, a tela assumia 10 quando o valor faltava,
-- e `deve_gerar_insights` — quem de fato decide se a rodada acontece — assumia
-- 5. Uma conta sem o campo via "10" na engrenagem e rodava a cada 5.
--
-- Agora são 6 nos três lugares. E entra `max_insights_por_rodada`, com 2: o
-- gerador tinha um teto fixo de 5 no código, que nenhuma configuração alcançava.
alter table public.restaurantes
  alter column config_insights set default
  '{"feedbacks_por_analise": 6, "max_insights_por_rodada": 2, "horas_entre_analises": 24, "max_importantes": 5, "max_observacoes": 3, "max_sugestoes_acoes_por_ciclo": 3}'::jsonb;

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
  )
  select contagem.livres >= cfg.necessarios, contagem.livres, cfg.necessarios
  from cfg, contagem;
$function$;
