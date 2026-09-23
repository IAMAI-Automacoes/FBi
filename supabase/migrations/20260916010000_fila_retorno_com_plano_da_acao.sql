-- =============================================================================
-- Fila do n8n: cada ação vem com o plano e a data de conclusão.
--
-- A IA do n8n só recebia o título, que foi escrito para o dono ("Oferecer canal
-- alternativo para reservas online"). Com o plano ela consegue dizer ao cliente,
-- em palavras simples, o que mudou de fato.
--
-- Os dados são lidos de `acoes_operacionais` na hora da leitura, e não copiados
-- para `aviso_pendente`: o aviso pode esperar dias na fila, e o dono pode editar
-- o título ou o plano nesse meio-tempo.
--
-- Só acrescenta chaves ao JSON de `acoes`; nada do que o n8n já usa muda.
-- =============================================================================

create or replace function public.fila_retorno_por_cliente(p_restaurante_id bigint default null::bigint)
returns table(contato_id uuid, telefone text, nome_cliente text, restaurante_id bigint, nome_restaurante text, whatsapp_base_url text, whatsapp_token text, ultimo_envio_em timestamp with time zone, aviso_ids uuid[], acoes jsonb, mensagem_sugerida text)
language sql
stable
set search_path to 'public'
as $function$
  with fila as (
    select f.*
      from public.fila_retorno_n8n f
     where p_restaurante_id is null or f.restaurante_id = p_restaurante_id
  ),
  pontos as (
    -- O mesmo cliente repete a mesma frase em mensagens diferentes; vai uma vez.
    select distinct on (f.contato_id, f.acao_id, lower(btrim(f.texto_do_ponto)))
           f.contato_id, f.acao_id, f.texto_do_ponto, f.feedback_em
      from fila f
     where f.texto_do_ponto is not null
     order by f.contato_id, f.acao_id, lower(btrim(f.texto_do_ponto)), f.feedback_em
  ),
  por_acao as (
    select f.contato_id,
           f.acao_id,
           -- sem ponto final: o título vai dentro do negrito, seguido de "— resolvido."
           regexp_replace(
             btrim(coalesce(max(f.titulo_acao), max(f.categoria), 'Melhoria no restaurante')),
             '[[:space:].;:!]+$', ''
           ) as titulo,
           max(f.categoria) as categoria,
           nullif(btrim(max(f.plano_detalhado)), '') as plano,
           case when bool_or(f.etapa = 'concluida') then 'concluida' else 'em_andamento' end as etapa,
           min(f.aviso_em) as desde
      from fila f
     group by f.contato_id, f.acao_id
  ),
  acoes_do_cliente as (
    select pa.contato_id,
           jsonb_agg(
             jsonb_build_object(
               'acao_id',         pa.acao_id,
               'titulo_acao',     pa.titulo,
               'categoria',       pa.categoria,
               'etapa',           pa.etapa,
               'plano_detalhado', pa.plano,
               'concluida_em',    ac.concluida_em,
               'feedbacks',       coalesce((
                 select jsonb_agg(jsonb_build_object('texto', p.texto_do_ponto, 'feedback_em', p.feedback_em)
                                  order by p.feedback_em)
                   from pontos p
                  where p.contato_id = pa.contato_id and p.acao_id = pa.acao_id
               ), '[]'::jsonb)
             )
             order by (pa.etapa = 'concluida') desc, pa.desde
           ) as acoes,
           string_agg(
             case when pa.etapa = 'concluida'
                  then '✅ *' || pa.titulo || '* — resolvido.'
                  else '🔧 *' || pa.titulo || '* — já estamos cuidando disso.' end,
             E'\n'
             order by (pa.etapa = 'concluida') desc, pa.desde
           ) as linhas
      from por_acao pa
      join public.acoes_operacionais ac on ac.id = pa.acao_id
     group by pa.contato_id
  ),
  cliente as (
    select f.contato_id,
           max(f.telefone)          as telefone,
           max(f.nome_cliente)      as nome_cliente,
           max(f.restaurante_id)    as restaurante_id,
           max(f.nome_restaurante)  as nome_restaurante,
           max(f.whatsapp_base_url) as whatsapp_base_url,
           max(f.whatsapp_token)    as whatsapp_token,
           max(f.ultimo_envio_em)   as ultimo_envio_em,
           array_agg(distinct f.aviso_id) as aviso_ids
      from fila f
     group by f.contato_id
  )
  select c.contato_id,
         c.telefone,
         c.nome_cliente,
         c.restaurante_id,
         c.nome_restaurante,
         c.whatsapp_base_url,
         c.whatsapp_token,
         c.ultimo_envio_em,
         c.aviso_ids,
         a.acoes,
         concat_ws(E'\n\n',
           'Olá' || coalesce(', ' || nullif(split_part(btrim(c.nome_cliente), ' ', 1), ''), '')
             || '! Aqui é do ' || coalesce(c.nome_restaurante, 'restaurante') || '.',
           'Você deixou um feedback pra gente, e queremos te contar o que fizemos com ele:',
           a.linhas,
           'Obrigado por nos ajudar a melhorar!'
         )
    from cliente c
    join acoes_do_cliente a on a.contato_id = c.contato_id
   order by c.restaurante_id, c.ultimo_envio_em nulls first, c.contato_id
$function$;
