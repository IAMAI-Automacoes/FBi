-- As telas "Feedbacks" e "Últimos Feedbacks" (Visão Geral) mostram a MENSAGEM
-- ORIGINAL do cliente (transcrição exata), não os pedaços separados. Os pedaços
-- (feedbacks_restaurante) são insumo interno pra IA agrupar em temas.
--
-- Como a mensagem original é mista (pode ter elogio E reclamação), esta view
-- deriva, por original: um sentimento geral e a lista de categorias dos pontos —
-- pra manter os filtros e os selos das telas funcionando.
--
-- security_invoker = respeita a RLS das tabelas base (isolamento por restaurante).
create or replace view public.feedbacks_originais_view
with (security_invoker = true) as
select
  o.id,
  o.restaurante_id,
  o.texto_original,
  o.telefone_cliente,
  o.created_at,
  case
    when bool_or(lower(f.sentimento) in ('negativo','negative'))
     and bool_or(lower(f.sentimento) in ('positivo','positive')) then 'neutro'   -- misto
    when bool_or(lower(f.sentimento) in ('negativo','negative')) then 'negativo'
    when bool_or(lower(f.sentimento) in ('positivo','positive')) then 'positivo'
    else 'neutro'
  end as sentimento,
  array_remove(array_agg(distinct f.categoria), null) as categorias
from public.feedbacks_originais o
left join public.feedbacks_restaurante f on f.origem_id = o.id
group by o.id, o.restaurante_id, o.texto_original, o.telefone_cliente, o.created_at;