-- Motor de resposta: fecha as portas abertas, conserta dois furos e entrega ao
-- n8n a fila já agrupada por cliente.
--
-- 1. PORTAS ABERTAS. Funções SECURITY DEFINER internas (cron, edge functions)
--    podiam ser chamadas por qualquer um com a chave pública do site — inclusive
--    `registrar_envio_retorno`, que marca avisos como enviados, e
--    `assinaturas_expirar_e_listar`, que devolve token de WhatsApp. E três views
--    rodavam como dono do banco, por cima do RLS: `fila_retorno_n8n` entregava
--    telefone de cliente e token de WhatsApp de todos os restaurantes para o
--    anônimo.
--
-- 2. 'expirado' NUNCA ERA ESCRITO. A view já escondia o aviso vencido, mas ele
--    ficava 'na_fila' para sempre. Agora a varredura de 10 em 10 min marca.
--
-- 3. VÍNCULO TARDIO SEM AVISO. A promoção de uma etapa cria avisos para os
--    feedbacks ligados À AÇÃO NAQUELE MOMENTO. Um feedback ligado depois (ação já
--    em andamento, já promovida) nunca era avisado daquela etapa.
--
-- 4. FILA POR CLIENTE. O n8n roda uma vez por dia e manda UMA mensagem por
--    cliente. `fila_retorno_por_cliente` devolve uma linha por cliente, com todas
--    as ações dele, os ids para confirmar o envio e uma mensagem pronta.
--
-- 5. OS 3 DIAS CONTAM EM DIAS DE CALENDÁRIO. A espera comparava horário exato. O
--    n8n roda sempre na mesma hora e confirma o envio minutos DEPOIS de começar:
--    quem recebeu segunda às 10h05 ainda não tinha "3 dias" na quinta às 10h00, e
--    só voltava na sexta. Agora é por data, no fuso de São Paulo: recebeu
--    segunda, pode receber de novo quinta.

-- ---------------------------------------------------------------------------
-- 2. 'expirado'
-- ---------------------------------------------------------------------------
create or replace function public.promover_transicoes_pendentes()
returns table(promovidas bigint, canceladas bigint, avisos_criados bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_promovidas bigint := 0;
  v_canceladas bigint := 0;
  v_avisos     bigint := 0;
  r            record;
  v_etapa      public.aviso_etapa;
  v_expira     int;
  v_inseridos  bigint;
begin
  update public.aviso_pendente
     set status = 'expirado'
   where status = 'na_fila'
     and expira_em <= now();

  with mortas as (
    update public.acao_status_historico h
       set cancelado_em = now()
      from public.acoes_operacionais a
     where a.id = h.acao_id
       and h.promover_em is not null
       and h.promovido_em is null
       and h.cancelado_em is null
       and public.ordem_status_acao(a.status) < public.ordem_status_acao(h.status_para)
    returning 1
  )
  select count(*) into v_canceladas from mortas;

  for r in
    select h.id, h.acao_id, h.restaurante_id, h.status_para
      from public.acao_status_historico h
      join public.acoes_operacionais a on a.id = h.acao_id
     where h.promover_em is not null
       and h.promover_em <= now()
       and h.promovido_em is null
       and h.cancelado_em is null
       and h.status_para in ('EM_ANDAMENTO', 'CONCLUIDO')
       and public.ordem_status_acao(a.status) >= public.ordem_status_acao(h.status_para)
     order by h.criado_em
  loop
    v_etapa := case when r.status_para = 'EM_ANDAMENTO'
                    then 'em_andamento'::public.aviso_etapa
                    else 'concluida'::public.aviso_etapa end;

    select coalesce((cfg.config_insights -> 'motor_resposta' ->> 'expira_aviso_dias')::int, 14)
      into v_expira
      from public.restaurantes cfg where cfg.id = r.restaurante_id;

    with novos as (
      insert into public.aviso_pendente
        (contato_id, restaurante_id, acao_id, etapa, expira_em,
         feedback_restaurante_id, feedbacks_originais_ids, feedbacks_restaurante_ids)
      select fo.contato_id, r.restaurante_id, r.acao_id, v_etapa,
             now() + make_interval(days => coalesce(v_expira, 14)),
             fa.feedback_restaurante_id,
             array[fo.id],
             case when fa.feedback_restaurante_id is null
                  then '{}'::bigint[] else array[fa.feedback_restaurante_id] end
        from public.feedback_acao fa
        join public.feedbacks_originais fo on fo.id = fa.feedback_original_id
        join public.contatos c            on c.id  = fo.contato_id
       where fa.acao_id = r.acao_id
         and fo.contato_id is not null
         and c.opt_out_em is null
      on conflict do nothing
      returning 1
    )
    select count(*) into v_inseridos from novos;

    v_avisos := v_avisos + v_inseridos;
    update public.acao_status_historico set promovido_em = now() where id = r.id;
    v_promovidas := v_promovidas + 1;
  end loop;

  return query select v_promovidas, v_canceladas, v_avisos;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Vínculo tardio
-- ---------------------------------------------------------------------------
-- Só avisa a etapa em que a ação ESTÁ e que JÁ FOI promovida. Se a etapa ainda
-- está nas 2 h de espera, a promoção vai pegar este vínculo sozinha.
--
-- "Concluída" só para feedback que chegou ANTES da conclusão: quem reclamou
-- depois de a ação ser dada como resolvida não pode receber "já resolvemos".
--
-- Nunca derruba o vínculo: um aviso a menos é melhor que um feedback solto.
create or replace function public.avisar_vinculo_tardio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status  text;
  v_etapa   record;
  v_contato uuid;
  v_chegou  timestamptz;
  v_expira  int;
begin
  begin
    select a.status into v_status
      from public.acoes_operacionais a
     where a.id = new.acao_id;

    if v_status is null or v_status not in ('EM_ANDAMENTO', 'CONCLUIDO') then
      return null;
    end if;

    select h.status_para, h.promovido_em, h.cancelado_em, h.criado_em
      into v_etapa
      from public.acao_status_historico h
     where h.acao_id = new.acao_id
     order by h.id desc
     limit 1;

    if v_etapa.status_para is distinct from v_status
       or v_etapa.promovido_em is null
       or v_etapa.cancelado_em is not null then
      return null;
    end if;

    select fo.contato_id, fo.created_at into v_contato, v_chegou
      from public.feedbacks_originais fo
      join public.contatos c on c.id = fo.contato_id
     where fo.id = new.feedback_original_id
       and c.restaurante_id = new.restaurante_id
       and c.opt_out_em is null;

    if v_contato is null then
      return null;
    end if;

    if v_status = 'CONCLUIDO' and v_chegou > v_etapa.criado_em then
      return null;
    end if;

    select coalesce((r.config_insights -> 'motor_resposta' ->> 'expira_aviso_dias')::int, 14)
      into v_expira
      from public.restaurantes r where r.id = new.restaurante_id;

    insert into public.aviso_pendente
      (contato_id, restaurante_id, acao_id, etapa, expira_em,
       feedback_restaurante_id, feedbacks_originais_ids, feedbacks_restaurante_ids)
    values (
      v_contato, new.restaurante_id, new.acao_id,
      case when v_status = 'EM_ANDAMENTO'
           then 'em_andamento'::public.aviso_etapa
           else 'concluida'::public.aviso_etapa end,
      now() + make_interval(days => coalesce(v_expira, 14)),
      new.feedback_restaurante_id,
      array[new.feedback_original_id],
      case when new.feedback_restaurante_id is null
           then '{}'::bigint[] else array[new.feedback_restaurante_id] end
    )
    on conflict do nothing;
  exception when others then
    raise warning 'avisar_vinculo_tardio (acao %): %', new.acao_id, sqlerrm;
  end;

  return null;
end;
$function$;

drop trigger if exists trg_feedback_acao_aviso_tardio on public.feedback_acao;
create trigger trg_feedback_acao_aviso_tardio
  after insert on public.feedback_acao
  for each row execute function public.avisar_vinculo_tardio();

-- ---------------------------------------------------------------------------
-- 4. Confirmação do envio, mais firme
-- ---------------------------------------------------------------------------
-- Duas correções no que já existia:
--   · os avisos precisam ser DO contato informado (o n8n não pode, por engano,
--     marcar como enviado o aviso de outro cliente);
--   · o rastro dos feedbacks era um produto cartesiano de dois `unnest`: aviso
--     antigo, sem ponto, zerava também a lista de mensagens originais.
-- E trava as linhas: duas confirmações simultâneas não gravam duas mensagens.
create or replace function public.registrar_envio_retorno(
  p_contato_id uuid,
  p_texto text,
  p_aviso_ids uuid[],
  p_provider_message_id text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_restaurante bigint;
  v_mensagem    uuid;
  v_originais   uuid[];
  v_pontos      bigint[];
begin
  perform 1
     from public.aviso_pendente
    where id = any(p_aviso_ids)
      and contato_id = p_contato_id
    for update;

  select restaurante_id into v_restaurante
    from public.aviso_pendente
   where id = any(p_aviso_ids)
     and contato_id = p_contato_id
     and status = 'na_fila'
   limit 1;

  if v_restaurante is null then
    return null;
  end if;

  select coalesce(array_agg(distinct o), '{}') into v_originais
    from public.aviso_pendente a, unnest(a.feedbacks_originais_ids) o
   where a.id = any(p_aviso_ids) and a.contato_id = p_contato_id and a.status = 'na_fila';

  select coalesce(array_agg(distinct p), '{}') into v_pontos
    from public.aviso_pendente a, unnest(a.feedbacks_restaurante_ids) p
   where a.id = any(p_aviso_ids) and a.contato_id = p_contato_id and a.status = 'na_fila';

  insert into public.mensagem_enviada
    (contato_id, restaurante_id, texto, status, enviado_em, provider_message_id,
     feedbacks_originais_ids, feedbacks_restaurante_ids)
  values
    (p_contato_id, v_restaurante, p_texto, 'enviado', now(), p_provider_message_id,
     v_originais, v_pontos)
  returning id into v_mensagem;

  update public.aviso_pendente
     set status = 'enviado', mensagem_id = v_mensagem
   where id = any(p_aviso_ids)
     and contato_id = p_contato_id
     and status = 'na_fila';

  update public.contatos set ultimo_envio_em = now() where id = p_contato_id;

  return v_mensagem;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. A fila do dia, uma linha por cliente
-- ---------------------------------------------------------------------------
-- Mesma view, só a espera muda para dias de calendário. Mesmas colunas, na mesma
-- ordem. ATENÇÃO: `create or replace view` apaga as opções da view — toda
-- recriação dela precisa repetir `with (security_invoker = true)`.
create or replace view public.fila_retorno_n8n
with (security_invoker = true)
as
select a.id as aviso_id,
       a.contato_id,
       c.telefone,
       c.nome as nome_cliente,
       a.restaurante_id,
       r.nome_restaurante,
       r.whatsapp_token,
       r.whatsapp_base_url,
       a.acao_id,
       ac.titulo_acao,
       ac.categoria,
       ac.plano_detalhado,
       a.etapa,
       a.feedback_restaurante_id,
       fr.texto_original as texto_do_ponto,
       fr.categoria as categoria_do_ponto,
       fo.id as feedback_original_id,
       fo.created_at as feedback_em,
       a.criado_em as aviso_em,
       c.ultimo_envio_em
  from public.aviso_pendente a
  join public.contatos c            on c.id = a.contato_id
  join public.restaurantes r        on r.id = a.restaurante_id
  join public.acoes_operacionais ac on ac.id = a.acao_id
  left join public.feedbacks_restaurante fr
         on fr.id = a.feedback_restaurante_id and fr.contato_id = a.contato_id
  left join public.feedbacks_originais fo on fo.id = fr.origem_id
 where a.status = 'na_fila'
   and a.expira_em > now()
   and c.opt_out_em is null
   and r.excluida_em is null
   and r.assinatura_status = 'ativa'
   and coalesce((r.config_insights -> 'motor_resposta' ->> 'ativo')::boolean, false) = true
   and (c.ultimo_envio_em is null
        or (now() at time zone 'America/Sao_Paulo')::date
           - (c.ultimo_envio_em at time zone 'America/Sao_Paulo')::date
           >= coalesce((r.config_insights -> 'motor_resposta' ->> 'cooldown_dias')::int, 3));

-- Lê `fila_retorno_n8n`, que já aplica TODAS as regras (na fila, não vencido,
-- sem opt-out, assinatura ativa, motor ligado, 3 dias desde o último envio).
--
-- O título da ação foi escrito para o DONO ("Padronizar receitas e
-- porcionamento…"). A mensagem pronta existe para o fluxo já sair funcionando;
-- o ideal é um nó de IA no n8n reescrever a partir de `acoes[].feedbacks[].texto`,
-- que são as palavras do próprio cliente.
--
-- A mesma ação com aviso de "em andamento" e de "concluída" vira uma linha só,
-- "concluída" — o cliente não precisa saber que ela passou por andamento. Os
-- dois avisos entram em `aviso_ids`, e o envio fecha os dois.
create or replace function public.fila_retorno_por_cliente(p_restaurante_id bigint default null)
returns table (
  contato_id        uuid,
  telefone          text,
  nome_cliente      text,
  restaurante_id    bigint,
  nome_restaurante  text,
  whatsapp_base_url text,
  whatsapp_token    text,
  ultimo_envio_em   timestamptz,
  aviso_ids         uuid[],
  acoes             jsonb,
  mensagem_sugerida text
)
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
           case when bool_or(f.etapa = 'concluida') then 'concluida' else 'em_andamento' end as etapa,
           min(f.aviso_em) as desde
      from fila f
     group by f.contato_id, f.acao_id
  ),
  acoes_do_cliente as (
    select pa.contato_id,
           jsonb_agg(
             jsonb_build_object(
               'acao_id',     pa.acao_id,
               'titulo_acao', pa.titulo,
               'categoria',   pa.categoria,
               'etapa',       pa.etapa,
               'feedbacks',   coalesce((
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

comment on function public.fila_retorno_por_cliente(bigint) is
  'Fila diária do n8n: uma linha por cliente com avisos prontos para sair. Depois de enviar, chamar registrar_envio_retorno com TODOS os aviso_ids da linha.';

-- ---------------------------------------------------------------------------
-- 1. Portas fechadas
-- ---------------------------------------------------------------------------
-- Quem chama estas funções: pg_cron (roda como dono) e edge functions com a
-- chave de serviço. Ninguém do navegador. `get_user_restaurante_id` fica aberta
-- porque as políticas de RLS a usam; `ativar_modelo_ia` e `meu_uso_ia` já eram
-- só do usuário logado.
revoke execute on function public.admin_push_subscriptions()                       from public, anon, authenticated;
revoke execute on function public.arquivar_concluidas_antigas()                    from public, anon, authenticated;
revoke execute on function public.assinaturas_expirar_e_listar()                   from public, anon, authenticated;
revoke execute on function public.conferir_contatos_cruzados()                     from public, anon, authenticated;
revoke execute on function public.deve_gerar_insights(bigint)                      from public, anon, authenticated;
revoke execute on function public.expirar_assinaturas()                            from public, anon, authenticated;
revoke execute on function public.feedbacks_para_geracao(bigint, integer)          from public, anon, authenticated;
revoke execute on function public.limpar_contas_abandonadas()                      from public, anon, authenticated;
revoke execute on function public.promover_transicoes_pendentes()                  from public, anon, authenticated;
revoke execute on function public.reconciliar_uso_feedbacks(bigint)                from public, anon, authenticated;
revoke execute on function public.registrar_envio_retorno(uuid, text, uuid[], text) from public, anon, authenticated;
revoke execute on function public.retriar_feedbacks_pendentes()                    from public, anon, authenticated;
revoke execute on function public.fila_retorno_por_cliente(bigint)                 from public, anon, authenticated;

grant execute on function public.admin_push_subscriptions()                       to service_role;
grant execute on function public.arquivar_concluidas_antigas()                    to service_role;
grant execute on function public.assinaturas_expirar_e_listar()                   to service_role;
grant execute on function public.conferir_contatos_cruzados()                     to service_role;
grant execute on function public.deve_gerar_insights(bigint)                      to service_role;
grant execute on function public.expirar_assinaturas()                            to service_role;
grant execute on function public.feedbacks_para_geracao(bigint, integer)          to service_role;
grant execute on function public.limpar_contas_abandonadas()                      to service_role;
grant execute on function public.promover_transicoes_pendentes()                  to service_role;
grant execute on function public.reconciliar_uso_feedbacks(bigint)                to service_role;
grant execute on function public.registrar_envio_retorno(uuid, text, uuid[], text) to service_role;
grant execute on function public.retriar_feedbacks_pendentes()                    to service_role;
grant execute on function public.fila_retorno_por_cliente(bigint)                 to service_role;

-- Views: passam a respeitar o RLS de quem lê (`fila_retorno_n8n` já foi
-- recriada acima com a opção). ATENÇÃO: `create or replace view` APAGA estas
-- opções. Toda recriação destas views precisa repetir `with (security_invoker = true)`.
revoke all on public.fila_retorno_n8n from anon, authenticated;
revoke all on public.feedbacks_livres from anon, authenticated;
alter view public.feedbacks_livres set (security_invoker = true);

-- A tela de Feedbacks lê esta view logada: o dono continua vendo só as dele
-- (o RLS de `feedbacks_originais` decide), o anônimo não vê nada.
revoke all on public.feedbacks_originais_view from anon;
alter view public.feedbacks_originais_view set (security_invoker = true);

notify pgrst, 'reload schema';
