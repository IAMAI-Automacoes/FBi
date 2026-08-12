-- 1) Sentimento da MENSAGEM ORIGINAL vem do n8n (a interface só mostra).
--    Valores: 'positivo' | 'negativo' | 'positivo e negativo' | 'neutro'.
--    (Os pedaços separados continuam 'positivo'|'negativo'|'neutro' — se tiver os
--     dois, o n8n divide em dois pedaços.)
alter table public.feedbacks_originais add column if not exists sentimento text;

-- 2) A view passa a usar o sentimento que o n8n gravou; se ainda não veio, cai
--    num derivado dos pedaços (mesma linguagem de 4 valores). Categorias seguem
--    sendo a união das categorias dos pedaços.
create or replace view public.feedbacks_originais_view
with (security_invoker = true) as
select
  o.id,
  o.restaurante_id,
  o.texto_original,
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
group by o.id, o.restaurante_id, o.texto_original, o.telefone_cliente, o.created_at, o.sentimento;

-- 3) Realtime: as telas (Visão Geral, Feedbacks, Relatórios) escutam mudanças
--    nas duas tabelas de feedback e recarregam sozinhas.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='feedbacks_restaurante') then
    alter publication supabase_realtime add table public.feedbacks_restaurante;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='feedbacks_originais') then
    alter publication supabase_realtime add table public.feedbacks_originais;
  end if;
end $$;