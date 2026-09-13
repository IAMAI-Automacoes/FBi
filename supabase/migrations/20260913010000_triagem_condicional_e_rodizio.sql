-- As três regras do ciclo de um feedback, como o dono definiu.
--
-- 1. CHEGADA. Um feedback novo só é "livre" DEPOIS da triagem: o sistema
--    procura uma ação onde ele se encaixa; se não houver, um insight da tela;
--    só então, sem nada, ele fica livre. Até aqui ele entrava na view
--    `feedbacks_livres` no instante do insert — antes de o `vincular-feedback`
--    terminar —, e tudo que conta ou consome livres (a geração da hora cheia,
--    a contagem que dispara uma rodada, a criação de ação) podia usá-lo no meio
--    da triagem. `triado_em` fecha essa janela.
--
-- 2. EXCLUSÃO MANUAL = liberdade condicional. O insight é só marcado. Os
--    feedbacks dele ficam soltos, mas NÃO servem de base para insight novo
--    (`invalidado_em`). Depois de cada rodada, uma IA do `gerar-insights` lê os
--    condicionais e liga aos insights recém-criados os que forem do mesmo
--    problema — sem mexer no texto, que é dos feedbacks livres.
--
-- 3. RODÍZIO ('excedente'). O insight que sai porque a aba passou de 8 fica
--    marcado assim, e os feedbacks dele voltam a ser livres DE VERDADE —
--    inclusive os que estavam em condicional e tinham sido religados a ele.
--    Isto inverte uma nota de `20260902000000`, que mantinha a marca para
--    sempre depois de um religamento: a regra do dono para o rodízio é soltar.

-- ---------------------------------------------------------------------------
-- 1. Triagem na chegada
-- ---------------------------------------------------------------------------
alter table public.feedbacks_restaurante
  add column if not exists triado_em timestamptz;

comment on column public.feedbacks_restaurante.triado_em is
  'Quando o vincular-feedback terminou de procurar ação e insight para este feedback. Nulo = ainda em triagem: não conta como livre para nada.';

-- Tudo que já existe passou pela triagem da época.
update public.feedbacks_restaurante set triado_em = created_at where triado_em is null;

-- `create or replace` basta: `fr.*` ganha `triado_em` no FIM da lista.
create or replace view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where fr.triado_em is not null
  and fr.invalidado_em is null
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

-- A geração lê SÓ o que é livre de verdade. Antes ela aceitava pontos presos a
-- insights ativos não fixados, porque a rodada ia substituí-los; a rodada não
-- substitui mais nada, então esses pontos já têm dono.
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
    and fr.triado_em is not null
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
        and i.deletado_em is null)
$$;

-- ---------------------------------------------------------------------------
-- 2 e 3. Encerramento: condicional na exclusão, liberdade no rodízio
-- ---------------------------------------------------------------------------
create or replace function public.liberar_pontos_insight_encerrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.motivo_encerramento = 'virou_acao' then
    return null;
  end if;

  -- Exclusão manual: liberdade condicional. Soltos, mas fora da matéria-prima.
  if new.motivo_encerramento = 'excluido' then
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

  -- Rodízio: livres de verdade, e a condicional de quem estava religado cai.
  if new.motivo_encerramento = 'excedente' then
    update public.feedbacks_restaurante fr
    set invalidado_em        = null,
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

  -- 'substituido' (legado: a geração não substitui mais): devolve ao pool.
  update public.feedbacks_restaurante fr
  set usado_por_insight_id = null,
      usado_em = case when fr.usado_por_acao_id is null then null else fr.usado_em end
  where fr.usado_por_insight_id = new.id
    and fr.usado_por_acao_id is null;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Rede de segurança da triagem
-- ---------------------------------------------------------------------------
-- A triagem roda encadeada (insert → classificar → vincular). Se um elo cair,
-- o feedback ficaria em triagem para sempre, invisível para tudo. A varredura
-- pede a triagem de novo aos 5 minutos; aos 120, desiste e o torna livre — um
-- feedback que ninguém consegue triar ainda vale como matéria-prima.
create or replace function public.retriar_feedbacks_pendentes()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
begin
  update public.feedbacks_restaurante
     set triado_em = now()
   where triado_em is null
     and created_at < now() - interval '120 minutes';

  for r in
    select id from public.feedbacks_restaurante
     where triado_em is null
       and created_at < now() - interval '5 minutes'
     order by created_at
     limit 20
  loop
    perform net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/vincular-feedback',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
      body := jsonb_build_object('feedback_id', r.id),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$function$;

select cron.schedule(
  'retriar-feedbacks-pendentes',
  '*/10 * * * *',
  $$ select public.retriar_feedbacks_pendentes(); $$
);
