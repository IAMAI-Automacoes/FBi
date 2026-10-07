-- Painel do EasyFeed Influencers, versão 2: os dados no mesmo formato da Visão
-- Geral dos restaurantes, para a tela usar os mesmos componentes
-- (KpiCards, TrendChart, TemasFeedback).
--
--   · temas: "Musica alta" e "Música alta" viram um só (chave sem acento e sem
--     maiúscula); aparece a grafia com acento quando existir;
--   · evolução: por dia até 31 dias e por mês acima disso (igual ao gráfico
--     "Tendência de Sentimento" da Visão Geral), com neutros e sugestões;
--   · totais do período anterior por tipo, para a tendência dos números do topo.

create or replace function public.influencers_sem_acento(p text)
returns text
language sql
immutable
as $$
  select translate(lower(btrim(coalesce(p, ''))), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$;

create or replace function public.influencers_painel(p_dias integer default 30, p_culinaria text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dias       int := greatest(1, least(coalesce(p_dias, 30), 365));
  v_agora      timestamptz := now();
  v_ini        timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
  v_ini_ant    timestamptz := now() - make_interval(days => 2 * greatest(1, least(coalesce(p_dias, 30), 365)));
  v_testes     boolean := public.influencers_incluem_testes();
  v_intervalo  text := case when coalesce(p_dias, 30) <= 31 then 'day' else 'month' end;
  v_culinarias jsonb;
  v_culinaria  text;
  v_res        jsonb;
begin
  if not (public.eh_influencer() or public.eh_admin_plataforma_ou_console()) then
    raise exception 'Sem acesso ao EasyFeed Influencers' using errcode = '42501';
  end if;

  -- Culinária só aparece (e só filtra) com 3 restaurantes ou mais: com menos,
  -- o filtro apontaria um restaurante.
  select coalesce(jsonb_agg(c.nome order by c.nome), '[]'::jsonb) into v_culinarias
    from (select r.tipo_culinaria as nome
            from public.influencers_restaurantes_base(v_testes) r
           where r.tipo_culinaria is not null
             and exists (select 1 from public.feedbacks_restaurante f
                          where f.restaurante_id = r.id and f.invalidado_em is null and f.created_at >= v_ini_ant)
           group by 1
          having count(*) >= 3) c;
  v_culinaria := case when p_culinaria is not null and v_culinarias ? p_culinaria then p_culinaria end;

  with pts as (
    select f.created_at,
           coalesce(nullif(btrim(f.categoria), ''), 'Outros') as categoria,
           f.resumo,
           f.tema_id,
           f.restaurante_id,
           public.influencers_tipo(f.sentimento) as tipo
      from public.feedbacks_restaurante f
      join public.influencers_restaurantes_base(v_testes) r on r.id = f.restaurante_id
     where f.invalidado_em is null
       and f.created_at >= v_ini_ant
       and (v_culinaria is null or r.tipo_culinaria = v_culinaria)
  ),
  atual as (select * from pts where created_at >= v_ini),
  ant as (select * from pts where created_at < v_ini),
  temas_agr as (
    select p.tipo,
           public.influencers_sem_acento(t.rotulo) as chave,
           -- A grafia com acento, quando alguma tiver; senão a mais comum.
           (array_agg(btrim(t.rotulo)
              order by (btrim(t.rotulo) <> translate(btrim(t.rotulo), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaaeeeeiiiiooooouuuucnAAAAEEIOOOUC')) desc,
                       btrim(t.rotulo)))[1] as rotulo,
           count(*) filter (where p.created_at >= v_ini) as mencoes,
           count(*) filter (where p.created_at < v_ini) as mencoes_anterior,
           count(distinct p.restaurante_id) filter (where p.created_at >= v_ini) as restaurantes
      from pts p
      join public.feedback_temas t on t.id = p.tema_id
     where nullif(btrim(t.rotulo), '') is not null
     group by p.tipo, public.influencers_sem_acento(t.rotulo)
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('dias', v_dias),
    'culinaria', v_culinaria,
    'culinarias', v_culinarias,
    'totais', (
      select jsonb_build_object(
        'pontos', count(*),
        'reclamacoes', count(*) filter (where tipo = 'reclamacao'),
        'elogios', count(*) filter (where tipo = 'elogio'),
        'sugestoes', count(*) filter (where tipo = 'sugestao'),
        'neutros', count(*) filter (where tipo = 'neutro'),
        'pontos_anterior', (select count(*) from ant))
        from atual),
    'totais_anterior', (
      select jsonb_build_object(
        'pontos', count(*),
        'reclamacoes', count(*) filter (where tipo = 'reclamacao'),
        'elogios', count(*) filter (where tipo = 'elogio'),
        'sugestoes', count(*) filter (where tipo = 'sugestao'),
        'neutros', count(*) filter (where tipo = 'neutro'))
        from ant),
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nome', c.categoria, 'reclamacoes', c.rec, 'elogios', c.elo, 'sugestoes', c.sug,
               'neutros', c.neu, 'total', c.total, 'total_anterior', c.total_ant)
             order by c.total desc, c.categoria), '[]'::jsonb)
        from (select categoria,
                     count(*) filter (where created_at >= v_ini and tipo = 'reclamacao') as rec,
                     count(*) filter (where created_at >= v_ini and tipo = 'elogio') as elo,
                     count(*) filter (where created_at >= v_ini and tipo = 'sugestao') as sug,
                     count(*) filter (where created_at >= v_ini and tipo = 'neutro') as neu,
                     count(*) filter (where created_at >= v_ini) as total,
                     count(*) filter (where created_at < v_ini) as total_ant
                from pts
               group by categoria) c
       where c.total > 0),
    -- "comum" = citado em mais de um restaurante; o número de restaurantes não sai daqui.
    'temas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'rotulo', x.rotulo, 'mencoes', x.mencoes,
               'mencoes_anterior', x.mencoes_anterior, 'comum', x.restaurantes >= 2)
             order by x.tipo, x.mencoes desc, x.rotulo), '[]'::jsonb)
        from (select a.*, row_number() over (partition by a.tipo order by a.mencoes desc, a.rotulo) as n
                from temas_agr a
               where a.mencoes > 0) x
       where x.n <= 8),
    'em_alta', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'rotulo', x.rotulo, 'mencoes', x.mencoes,
               'mencoes_anterior', x.mencoes_anterior, 'comum', x.restaurantes >= 2)
             order by x.mencoes - x.mencoes_anterior desc, x.mencoes desc), '[]'::jsonb)
        from (select * from temas_agr a
               where a.mencoes >= 2 and a.mencoes > a.mencoes_anterior
               order by a.mencoes - a.mencoes_anterior desc, a.mencoes desc
               limit 6) x),
    -- Resumos curtos, sem nada que identifique: fora telefone, link, e-mail ou @.
    'frases', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', x.tipo, 'texto', x.texto, 'categoria', x.categoria)
             order by x.tipo, x.n), '[]'::jsonb)
        from (select d.*, row_number() over (partition by d.tipo order by d.ultimo desc) as n
                from (select tipo,
                             min(categoria) as categoria,
                             min(btrim(resumo)) as texto,
                             max(created_at) as ultimo
                        from atual
                       where length(btrim(coalesce(resumo, ''))) between 3 and 160
                         and resumo !~ '\d{6,}'
                         and resumo !~* '(https?://|www\.|@)'
                       group by tipo, lower(btrim(resumo))) d) x
       where x.n <= 12),
    -- Mesmo recorte do gráfico da Visão Geral: por dia até 31 dias, por mês acima.
    'evolucao', jsonb_build_object(
      'intervalo', case v_intervalo when 'day' then 'dia' else 'mes' end,
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'inicio', to_char(s.inicio, 'YYYY-MM-DD'),
                 'reclamacoes', c.rec, 'elogios', c.elo, 'neutros', c.neu, 'sugestoes', c.sug)
               order by s.inicio), '[]'::jsonb)
          from generate_series(
                 date_trunc(v_intervalo, v_ini at time zone 'America/Sao_Paulo') + case v_intervalo when 'day' then interval '1 day' else interval '0' end,
                 date_trunc(v_intervalo, v_agora at time zone 'America/Sao_Paulo'),
                 case v_intervalo when 'day' then interval '1 day' else interval '1 month' end) as s(inicio)
          left join lateral (
                 select count(*) filter (where a.tipo = 'reclamacao') as rec,
                        count(*) filter (where a.tipo = 'elogio') as elo,
                        count(*) filter (where a.tipo = 'neutro') as neu,
                        count(*) filter (where a.tipo = 'sugestao') as sug
                   from atual a
                  where date_trunc(v_intervalo, a.created_at at time zone 'America/Sao_Paulo') = s.inicio) c on true))
  ) into v_res;

  return v_res;
end;
$$;

revoke execute on function public.influencers_painel(integer, text) from public, anon;
grant execute on function public.influencers_painel(integer, text) to authenticated;
