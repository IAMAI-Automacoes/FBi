-- Conta os feedbacks por tema dentro de um período e (opcional) sentimento —
-- pros filtros da seção "O que os clientes estão comentando". O feedback_temas.
-- quantidade é o total geral; aqui a contagem é feita sobre feedbacks_restaurante
-- filtrando por created_at, então respeita "últimos X dias".
--
-- security invoker: roda com o papel de quem chama, então a RLS das duas tabelas
-- garante que o restaurante só vê os próprios temas/feedbacks.
create or replace function public.temas_agrupados(
  p_restaurante_id bigint,
  p_desde timestamptz default null,
  p_tipo  text default null
)
returns table (id uuid, rotulo text, tipo text, quantidade bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, t.rotulo, t.tipo, count(f.id) as quantidade
  from public.feedback_temas t
  join public.feedbacks_restaurante f on f.tema_id = t.id
  where t.restaurante_id = p_restaurante_id
    and (p_desde is null or f.created_at >= p_desde)
    and (p_tipo  is null or t.tipo = p_tipo)
  group by t.id, t.rotulo, t.tipo
  having count(f.id) > 0
  order by count(f.id) desc, t.rotulo
$$;

grant execute on function public.temas_agrupados(bigint, timestamptz, text) to authenticated;