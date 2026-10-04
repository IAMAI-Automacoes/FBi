-- feedbacks_originais_view: o sentimento da mensagem vem do n8n
-- (feedbacks_originais.sentimento). Só quando ele está vazio a view calcula a
-- partir dos pontos — e esse cálculo de reserva passa a conhecer a Sugestão
-- (mensagem só com sugestão = 'Sugestão'). A ordem é a mesma do n8n:
-- positivo e negativo > negativo > positivo > sugestão > neutro.
create or replace view public.feedbacks_originais_view
with (security_invoker = true) as
 select o.id,
    o.restaurante_id,
    o.texto_original,
    o.texto_destacado,
    o.telefone_cliente,
    o.created_at,
    coalesce(o.sentimento,
        case
            when bool_or(lower(f.sentimento) = any (array['negativo'::text, 'negative'::text])) and bool_or(lower(f.sentimento) = any (array['positivo'::text, 'positive'::text])) then 'positivo e negativo'::text
            when bool_or(lower(f.sentimento) = any (array['negativo'::text, 'negative'::text])) then 'negativo'::text
            when bool_or(lower(f.sentimento) = any (array['positivo'::text, 'positive'::text])) then 'positivo'::text
            when bool_or(f.sentimento ilike '%sugest%') then 'Sugestão'::text
            else 'neutro'::text
        end) as sentimento,
    array_remove(array_agg(distinct f.categoria), null::text) as categorias,
    coalesce(o.texto_destacado, o.texto_original, nullif(string_agg(distinct coalesce(f.texto_original, f.resumo), '. '::text), ''::text)) as texto_exibicao
   from public.feedbacks_originais o
     left join public.feedbacks_restaurante f on f.origem_id = o.id
  group by o.id, o.restaurante_id, o.texto_original, o.texto_destacado, o.telefone_cliente, o.created_at, o.sentimento;
