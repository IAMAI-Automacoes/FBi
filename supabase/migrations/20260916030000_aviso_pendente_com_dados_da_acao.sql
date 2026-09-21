-- =============================================================================
-- aviso_pendente guarda os dados da ação, sempre iguais aos da ação.
--
-- Colunas copiadas de `acoes_operacionais`: titulo_acao, plano_detalhado,
-- categoria, prioridade e concluida_em.
--
-- Como ficam iguais:
-- - Ao criar ou alterar um aviso, os dados são lidos da ação
--   (`trg_aviso_copiar_dados_da_acao`). Quem cria aviso não precisa lembrar
--   de preencher, e ninguém consegue gravar um valor diferente do da ação.
-- - Quando a ação muda — o dono edita o título ou o plano, a IA reescreve o
--   plano, o card é concluído — todos os avisos dela são atualizados
--   (`trg_acoes_atualizar_avisos`).
--
-- A fila do n8n passa a ler estes dados do próprio aviso.
-- =============================================================================

alter table public.aviso_pendente
  add column if not exists titulo_acao     text,
  add column if not exists plano_detalhado text,
  add column if not exists categoria       text,
  add column if not exists prioridade      text,
  add column if not exists concluida_em    timestamptz;

-- ---------------------------------------------------------------------------
-- Aviso: sempre com os dados atuais da ação
-- ---------------------------------------------------------------------------
create or replace function public.copiar_dados_da_acao_no_aviso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  select a.titulo_acao, a.plano_detalhado, a.categoria, a.prioridade, a.concluida_em
    into new.titulo_acao, new.plano_detalhado, new.categoria, new.prioridade, new.concluida_em
    from public.acoes_operacionais a
   where a.id = new.acao_id;

  return new;
end;
$function$;

drop trigger if exists trg_aviso_copiar_dados_da_acao on public.aviso_pendente;
create trigger trg_aviso_copiar_dados_da_acao
  before insert or update on public.aviso_pendente
  for each row execute function public.copiar_dados_da_acao_no_aviso();

-- ---------------------------------------------------------------------------
-- Ação editada: os avisos dela acompanham
-- ---------------------------------------------------------------------------
-- WHEN compara a linha final: `concluida_em` é preenchida por um trigger BEFORE
-- quando o status muda, e um `UPDATE OF concluida_em` não enxergaria isso.
create or replace function public.atualizar_avisos_da_acao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.aviso_pendente av
     set titulo_acao     = new.titulo_acao,
         plano_detalhado = new.plano_detalhado,
         categoria       = new.categoria,
         prioridade      = new.prioridade,
         concluida_em    = new.concluida_em
   where av.acao_id = new.id
     and (av.titulo_acao, av.plano_detalhado, av.categoria, av.prioridade, av.concluida_em)
         is distinct from
         (new.titulo_acao, new.plano_detalhado, new.categoria, new.prioridade, new.concluida_em);

  return null;
end;
$function$;

drop trigger if exists trg_acoes_atualizar_avisos on public.acoes_operacionais;
create trigger trg_acoes_atualizar_avisos
  after update on public.acoes_operacionais
  for each row
  when (   old.titulo_acao     is distinct from new.titulo_acao
        or old.plano_detalhado is distinct from new.plano_detalhado
        or old.categoria       is distinct from new.categoria
        or old.prioridade      is distinct from new.prioridade
        or old.concluida_em    is distinct from new.concluida_em)
  execute function public.atualizar_avisos_da_acao();

-- Avisos que já existem: o update dispara a cópia.
update public.aviso_pendente set acao_id = acao_id;

-- ---------------------------------------------------------------------------
-- Fila do n8n lê do aviso
-- ---------------------------------------------------------------------------
-- As colunas mantêm nome e posição; `prioridade` e `concluida_em` entram no fim.
create or replace view public.fila_retorno_n8n
with (security_invoker = true)
as
select a.id                   as aviso_id,
       a.contato_id,
       c.telefone,
       c.nome                 as nome_cliente,
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
           >= coalesce((r.config_insights -> 'motor_resposta' ->> 'cooldown_dias')::int, 3));

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
