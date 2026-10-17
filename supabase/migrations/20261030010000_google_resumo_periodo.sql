-- Página Google: os números do período escolhido no filtro de data (o mesmo
-- filtro das outras telas). Pedido do Raver em 16/10/2026.
--
-- Calculado aqui, e não no navegador: a tela carrega as avaliações aos poucos
-- ("Mostrar mais"), e um restaurante com milhares delas teria a conta errada.
-- `p_de` / `p_ate`: [início, fim) — vazios = todo o período.
-- `ultima_em` é a avaliação mais recente de todas, sem o filtro.

create or replace function public.google_resumo_periodo(p_de timestamptz default null, p_ate timestamptz default null)
returns table (
  estrelas_1 integer, estrelas_2 integer, estrelas_3 integer, estrelas_4 integer, estrelas_5 integer,
  quantidade integer, media numeric, respondidas integer, sem_resposta integer, negativas integer,
  com_comentario integer, ultima_em timestamptz
)
language sql stable
set search_path = public
as $$
  with todas as (
    select nota, resposta, comentario, criada_em
      from public.google_avaliacoes
     where restaurante_id = public.get_user_restaurante_id()
  ),
  no_periodo as (
    select * from todas
     where (p_de is null or criada_em >= p_de)
       and (p_ate is null or criada_em < p_ate)
  )
  select
    count(*) filter (where nota = 1)::integer,
    count(*) filter (where nota = 2)::integer,
    count(*) filter (where nota = 3)::integer,
    count(*) filter (where nota = 4)::integer,
    count(*) filter (where nota = 5)::integer,
    count(*)::integer,
    round(avg(nota), 2),
    (count(*) filter (where resposta is not null))::integer,
    (count(*) filter (where resposta is null))::integer,
    (count(*) filter (where nota <= 3))::integer,
    (count(*) filter (where comentario is not null))::integer,
    (select max(criada_em) from todas)
  from no_periodo
$$;

revoke execute on function public.google_resumo_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.google_resumo_periodo(timestamptz, timestamptz) to authenticated;
