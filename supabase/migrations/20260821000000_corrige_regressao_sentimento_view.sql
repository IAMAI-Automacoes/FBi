-- Corrige regressão introduzida na migration 20260820000000 (texto_destacado):
-- ao recriar a view, ela voltou pra uma versão antiga que (1) ignorava o
-- sentimento que o n8n grava direto em feedbacks_originais.sentimento e
-- (2) tratava feedback misto (elogio + reclamação) como 'neutro' em vez de
-- 'positivo e negativo'. Restaura a lógica correta (da migration
-- 20260812110000), mantendo a coluna texto_destacado.
create or replace view public.feedbacks_originais_view
with (security_invoker = true) as
select
  o.id,
  o.restaurante_id,
  o.texto_original,
  o.texto_destacado,
  o.telefone_cliente,
  o.created_at,
  coalesce(
    o.sentimento,
    case
      when bool_or(lower(f.sentimento) in ('negativo','negative'))
       and bool_or(lower(f.sentimento) in ('positivo','positive')) then 'positivo e negativo'
      when bool_or(lower(f.sentimento) in ('negativo','negative')) then 'negativo'
      when bool_or(lower(f.sentimento) in ('positivo','positive')) then 'positivo'
      else 'neutro'
    end
  ) as sentimento,
  array_remove(array_agg(distinct f.categoria), null) as categorias
from public.feedbacks_originais o
left join public.feedbacks_restaurante f on f.origem_id = o.id
group by o.id, o.restaurante_id, o.texto_original, o.texto_destacado, o.telefone_cliente, o.created_at, o.sentimento;
