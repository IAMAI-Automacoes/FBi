-- Página Google: o gráfico mês a mês segue o filtro de data (pedido do Raver,
-- 16/10/2026: o filtro vale para a página inteira).
--
-- Os meses vão do mês em que o período começa (ou da primeira avaliação, se
-- for antes) até o mês em que ele termina (ou o atual). Para cada mês:
--   - media / quantidade: só as avaliações daquele mês que estão no período
--     (nas pontas, um mês pela metade conta só a parte dentro do filtro);
--   - media_acumulada: a "média geral" — todas as avaliações, da primeira até
--     o fim daquele mês (sem passar do fim do período). É a nota que o
--     restaurante tinha naquele momento, por isso não recomeça no início do filtro.
-- `p_de` / `p_ate`: [início, fim) — vazios = todo o período.

create or replace function public.google_medias_periodo(p_de timestamptz default null, p_ate timestamptz default null)
returns table (mes date, media numeric, quantidade integer, media_acumulada numeric)
language sql stable
set search_path = public
as $$
  with av as (
    select criada_em, nota, (date_trunc('month', criada_em at time zone 'America/Sao_Paulo'))::date as mes
      from public.google_avaliacoes
     where restaurante_id = public.get_user_restaurante_id()
  ),
  limites as (
    select
      greatest(
        (select min(mes) from av),
        coalesce((date_trunc('month', p_de at time zone 'America/Sao_Paulo'))::date, (select min(mes) from av))
      ) as ini,
      least(
        (date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date,
        coalesce((date_trunc('month', (p_ate - interval '1 microsecond') at time zone 'America/Sao_Paulo'))::date, 'infinity'::date)
      ) as fim
  ),
  meses as (
    select generate_series(l.ini, l.fim, interval '1 month')::date as mes
      from limites l
     where l.ini is not null and l.ini <= l.fim
  ),
  no_periodo as (
    select a.mes, sum(a.nota) as soma, count(*) as qtd
      from av a
     where (p_de is null or a.criada_em >= p_de)
       and (p_ate is null or a.criada_em < p_ate)
     group by a.mes
  )
  select m.mes,
         round(p.soma::numeric / nullif(p.qtd, 0), 2),
         coalesce(p.qtd, 0)::integer,
         (select round(avg(a.nota), 2)
            from av a
           where a.mes <= m.mes
             and (p_ate is null or a.criada_em < p_ate))
    from meses m
    left join no_periodo p using (mes)
   order by m.mes
$$;

revoke execute on function public.google_medias_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.google_medias_periodo(timestamptz, timestamptz) to authenticated;
