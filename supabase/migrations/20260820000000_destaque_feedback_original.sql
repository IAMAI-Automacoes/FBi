-- Destaca em negrito os trechos do feedback original que permitem entender a
-- mensagem batendo o olho (sem precisar ler tudo) — mostrado em "Últimos
-- Feedbacks" (Visão Geral) e na página /feedbacks.
--
-- Como funciona: quando o n8n grava a mensagem original em feedbacks_originais,
-- um trigger dispara (async, via pg_net) a edge function `destacar-feedback`,
-- que pede pra IA devolver o MESMO texto com ** em volta dos trechos-chave.
-- O texto original nunca é alterado de fato: a função confere que, tirando os
-- **, a resposta bate EXATAMENTE com texto_original antes de gravar — senão
-- descarta o destaque (o feedback aparece normal, sem negrito).

alter table public.feedbacks_originais
  add column if not exists texto_destacado text;

-- Recria a view (já existente) só pra expor a coluna nova. `create or replace`
-- não deixa inserir uma coluna no meio da lista existente — precisa dropar.
drop view if exists public.feedbacks_originais_view;
create view public.feedbacks_originais_view
with (security_invoker = true) as
select
  o.id,
  o.restaurante_id,
  o.texto_original,
  o.texto_destacado,
  o.telefone_cliente,
  o.created_at,
  -- Prioriza o sentimento que o n8n grava direto na mensagem original (pode
  -- ser 'positivo e negativo' pra feedback misto); só deriva dos pedaços
  -- separados (feedbacks_restaurante) quando o n8n ainda não gravou nada.
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

-- Dispara o destaque automático a cada mensagem original que chega.
create or replace function public.trg_destacar_feedback()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/destacar-feedback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM"}'::jsonb,
    body := jsonb_build_object('original_id', new.id)
  );
  return null;
end;
$$;

drop trigger if exists trg_feedbacks_originais_destacar on public.feedbacks_originais;
create trigger trg_feedbacks_originais_destacar
  after insert on public.feedbacks_originais
  for each row execute function public.trg_destacar_feedback();
