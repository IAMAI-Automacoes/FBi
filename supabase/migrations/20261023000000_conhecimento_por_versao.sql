-- Base de conhecimento por versão do EasyFeed (Restaurante e RH).
--
-- Decisão do Raver (14/10/2026): o RH ganha uma base própria. Cada documento
-- GLOBAL (o material que a IA consulta para todas as contas, aba Conhecimento
-- do admin) passa a dizer de qual versão é; a IA de cada conta consulta só a
-- base da versão dela. O material próprio de cada conta (escopo 'restaurante')
-- continua igual. Os 15 documentos que existiam são do restaurante.
--
-- As duas funções de busca são as que estavam no ar, só com o filtro a mais.
-- Pode rodar mais de uma vez.

alter table public.documentos_ia add column if not exists area text not null default 'restaurante';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_ia_area_check') then
    alter table public.documentos_ia add constraint documentos_ia_area_check check (area in ('restaurante', 'rh'));
  end if;
end $$;
comment on column public.documentos_ia.area is 'De qual versão do EasyFeed é o material global: restaurante ou rh. A IA de cada conta só consulta o global da versão dela.';

-- A versão de uma conta, para a busca: 'rh' ou 'restaurante' (conta sem versão
-- conta como restaurante).
create or replace function public.area_da_conta(p_restaurante_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when (select r.area from public.restaurantes r where r.id = p_restaurante_id) = 'rh' then 'rh' else 'restaurante' end
$$;

create or replace function public.area_da_conta_logada()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when (select r.area from public.restaurantes r where r.auth_user_id = auth.uid()) = 'rh' then 'rh' else 'restaurante' end
$$;

revoke all on function public.area_da_conta(bigint) from public, anon;
grant execute on function public.area_da_conta(bigint) to authenticated, service_role;
revoke all on function public.area_da_conta_logada() from public, anon;
grant execute on function public.area_da_conta_logada() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buscar_conhecimento(consulta_embedding vector, consulta_texto text DEFAULT ''::text, limite integer DEFAULT 6, similaridade_minima double precision DEFAULT 0.25)
 RETURNS TABLE(conteudo text, titulo text, escopo text, url text, similaridade double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with consulta as (
    select nullif(replace(plainto_tsquery('portuguese', consulta_texto)::text, ' & ', ' | '), '')::tsquery as q
  ),
  vetorial as (
    select t.id, t.conteudo, t.documento_id,
           1 - (t.embedding <=> consulta_embedding) as sim
    from documento_trechos t
    where t.embedding is not null
      and 1 - (t.embedding <=> consulta_embedding) > similaridade_minima
      and exists (select 1 from documentos_ia d where d.id = t.documento_id
                   and (d.escopo <> 'global' or d.area = public.area_da_conta_logada()))
    order by t.embedding <=> consulta_embedding
    limit 30
  ),
  textual as (
    select t.id, t.conteudo, t.documento_id, ts_rank(t.tsv, c.q) as sim
    from documento_trechos t, consulta c
    where c.q is not null and t.tsv @@ c.q
      and exists (select 1 from documentos_ia d where d.id = t.documento_id
                   and (d.escopo <> 'global' or d.area = public.area_da_conta_logada()))
    order by ts_rank(t.tsv, c.q) desc
    limit 30
  ),
  limites as (
    select
      (select min(sim) from vetorial) as v_min, (select max(sim) from vetorial) as v_max,
      (select min(sim) from textual)  as x_min, (select max(sim) from textual)  as x_max
  ),
  juntos as (
    select
      coalesce(v.id, x.id) as id,
      coalesce(v.conteudo, x.conteudo) as conteudo,
      coalesce(v.documento_id, x.documento_id) as documento_id,
      coalesce(v.sim, 0) as sim_vetorial,
      -- normaliza cada sinal para 0..1 antes de somar
      1.0 * coalesce((v.sim - l.v_min) / nullif(l.v_max - l.v_min, 0), 0)
        + 2.5 * coalesce((x.sim - l.x_min) / nullif(l.x_max - l.x_min, 0), 0)
        + case when x.id is not null then 0.8 else 0 end  -- bônus por casar termo exato
        as pontos
    from vetorial v
    full outer join textual x on x.id = v.id
    cross join limites l
  )
  select j.conteudo, d.titulo, d.escopo, d.url, j.sim_vetorial as similaridade
  from juntos j
  join documentos_ia d on d.id = j.documento_id
  order by j.pontos desc
  limit limite;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_conhecimento_para(consulta_embedding vector, p_restaurante_id bigint, consulta_texto text DEFAULT ''::text, limite integer DEFAULT 8)
 RETURNS TABLE(conteudo text, titulo text, escopo text, url text, similaridade double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with consulta as (
    select nullif(replace(plainto_tsquery('portuguese', consulta_texto)::text, ' & ', ' | '), '')::tsquery as q
  ),
  candidatos as (
    select t.id, t.conteudo, t.documento_id, t.embedding, t.tsv
    from documento_trechos t
    where t.embedding is not null
      and (t.restaurante_id = p_restaurante_id or t.restaurante_id is null)
      and exists (select 1 from documentos_ia d where d.id = t.documento_id
                   and (d.escopo <> 'global' or d.area = public.area_da_conta(p_restaurante_id)))
  ),
  vetorial as (
    select id, conteudo, documento_id, 1 - (embedding <=> consulta_embedding) as sim
    from candidatos
    order by embedding <=> consulta_embedding
    limit 30
  ),
  textual as (
    select c.id, c.conteudo, c.documento_id, ts_rank(c.tsv, q.q) as sim
    from candidatos c, consulta q
    where q.q is not null and c.tsv @@ q.q
    order by ts_rank(c.tsv, q.q) desc
    limit 30
  ),
  lim as (
    select (select min(sim) from vetorial) v_min, (select max(sim) from vetorial) v_max,
           (select min(sim) from textual) x_min, (select max(sim) from textual) x_max
  ),
  juntos as (
    select coalesce(v.id, x.id) id,
           coalesce(v.conteudo, x.conteudo) conteudo,
           coalesce(v.documento_id, x.documento_id) documento_id,
           coalesce(v.sim, 0) sim_v,
           1.0 * coalesce((v.sim - l.v_min)/nullif(l.v_max - l.v_min,0), 0)
             + 2.5 * coalesce((x.sim - l.x_min)/nullif(l.x_max - l.x_min,0), 0)
             + case when x.id is not null then 0.8 else 0 end as pontos
    from vetorial v full outer join textual x on x.id = v.id cross join lim l
  )
  select j.conteudo, d.titulo, d.escopo, d.url, j.sim_v
  from juntos j join documentos_ia d on d.id = j.documento_id
  order by j.pontos desc
  limit limite;
$function$;
