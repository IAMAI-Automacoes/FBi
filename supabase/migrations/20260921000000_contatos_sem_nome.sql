-- =============================================================================
-- A coluna `contatos.nome` sai.
--
-- Ela nunca foi preenchida pelo fluxo de entrada: o único contato criado por ele
-- (restaurante 26) está sem nome, e os outros nomes do banco são dados de teste
-- escritos à mão. Escrever "Oi, Fulano" com um nome que quase sempre não existe
-- — ou que é o apelido que a pessoa pôs no WhatsApp — não ajuda ninguém.
--
-- Some junto o `nome_cliente` da fila do n8n e a saudação com nome da
-- `mensagem_sugerida`. A view e a função precisam ser recriadas (não dá para
-- tirar coluna com CREATE OR REPLACE), e por isso as permissões são refeitas.
-- =============================================================================

drop function if exists public.fila_retorno_por_cliente(bigint);
drop view if exists public.fila_retorno_n8n;

create view public.fila_retorno_n8n
with (security_invoker = true)
as
select a.id                   as aviso_id,
       a.contato_id,
       c.telefone,
       a.restaurante_id,
       r.nome_restaurante,
       r.whatsapp_token,
       r.whatsapp_base_url,
       a.acao_id,
       a.titulo_acao,
       a.categoria,
       a.plano_detalhado,
       a.etapa,
       a.feedback_restaurante_id,
       fr.texto_original      as texto_do_ponto,
       fr.categoria           as categoria_do_ponto,
       fo.id                  as feedback_original_id,
       fo.created_at          as feedback_em,
       a.criado_em            as aviso_em,
       c.ultimo_envio_em,
       a.prioridade,
       a.concluida_em
  from public.aviso_pendente a
  join public.contatos c     on c.id = a.contato_id
  join public.restaurantes r on r.id = a.restaurante_id
  left join public.feedbacks_restaurante fr on fr.id = a.feedback_restaurante_id and fr.contato_id = a.contato_id
  left join public.feedbacks_originais fo   on fo.id = fr.origem_id
 where a.status = 'na_fila'
   and a.expira_em > now()
   and c.opt_out_em is null
   and r.excluida_em is null
   and r.assinatura_status = 'ativa'
   and coalesce((r.config_insights -> 'motor_resposta' ->> 'ativo')::boolean, false) = true
   and (c.ultimo_envio_em is null
        or ((now() at time zone 'America/Sao_Paulo')::date
            - (c.ultimo_envio_em at time zone 'America/Sao_Paulo')::date)
           > coalesce((r.config_insights -> 'motor_resposta' ->> 'cooldown_dias')::int, 3));

comment on view public.fila_retorno_n8n is
  'Avisos prontos para o n8n entregar. Uma linha por feedback avisado; agrupe por contato_id. Ja filtra opt-out, assinatura, motor ligado e a carencia: precisa ter passado MAIS de cooldown_dias desde a ultima mensagem.';

revoke all on public.fila_retorno_n8n from anon, authenticated;
grant select on public.fila_retorno_n8n to service_role;

create function public.fila_retorno_por_cliente(p_restaurante_id bigint default null::bigint)
returns table(contato_id uuid, telefone text, restaurante_id bigint, nome_restaurante text, whatsapp_base_url text, whatsapp_token text, ultimo_envio_em timestamp with time zone, aviso_ids uuid[], acoes jsonb, mensagem_sugerida text)
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
           max(f.concluida_em) as concluida_em,
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
               'concluida_em',    pa.concluida_em,
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
     group by pa.contato_id
  ),
  cliente as (
    select f.contato_id,
           max(f.telefone)          as telefone,
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
         c.restaurante_id,
         c.nome_restaurante,
         c.whatsapp_base_url,
         c.whatsapp_token,
         c.ultimo_envio_em,
         c.aviso_ids,
         a.acoes,
         concat_ws(E'\n\n',
           'Olá! Aqui é do ' || coalesce(c.nome_restaurante, 'restaurante') || '.',
           'Você deixou um feedback pra gente, e queremos te contar o que fizemos com ele:',
           a.linhas,
           'Obrigado por nos ajudar a melhorar!'
         )
    from cliente c
    join acoes_do_cliente a on a.contato_id = c.contato_id
   order by c.restaurante_id, c.ultimo_envio_em nulls first, c.contato_id
$function$;

revoke execute on function public.fila_retorno_por_cliente(bigint) from public, anon, authenticated;
grant execute on function public.fila_retorno_por_cliente(bigint) to service_role;

alter table public.contatos drop column nome;
