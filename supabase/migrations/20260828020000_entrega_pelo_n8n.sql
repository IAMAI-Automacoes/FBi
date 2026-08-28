-- A entrega da mensagem de retorno passa para o n8n.
--
-- ## O que muda
--
-- Antes, o `motor-retorno-worker` (483 linhas, cron de 5 em 5 min) fazia tudo:
-- aplicava carencia e horario de silencio, agrupava os avisos por cliente,
-- chamava a IA para redigir e gravava a mensagem pronta. O n8n so lia e
-- entregava.
--
-- Agora o Supabase para na TABELA DE AVISOS e o n8n faz o resto: le os clientes
-- que estao ha 3+ dias sem mensagem, junta os avisos de cada um, redige e manda.
--
-- ## O que continua aqui, e por que
--
-- A regra das 2 horas. Ela nao e do motor de entrega — e a regra de negocio que
-- diz "so avise depois de ter certeza de que a mudanca de status foi
-- intencional". Sai de dentro do worker e vira cron proprio.
--
-- O filtro dos 3 dias tambem fica, dentro da view. E regra de negocio, e um no
-- mal configurado no n8n nao pode fura-la e mandar duas mensagens no mesmo dia
-- para a mesma pessoa.
--
-- O horario de silencio (22h-9h) deixa de existir como codigo: o n8n roda uma
-- vez por dia num horario que voce escolhe, o que resolve sozinho.

-- ---------------------------------------------------------------------------
-- 1. A regra das 2h ganha cron proprio
-- ---------------------------------------------------------------------------
select cron.unschedule('motor-retorno-worker')
where exists (select 1 from cron.job where jobname = 'motor-retorno-worker');

select cron.schedule(
  'promover-transicoes-acao',
  '*/10 * * * *',
  $cron$ select public.promover_transicoes_pendentes(); $cron$
);

-- ---------------------------------------------------------------------------
-- 2. A fila que o n8n consome
-- ---------------------------------------------------------------------------
-- Uma linha por AVISO (ou seja, por feedback separado). O n8n agrupa por
-- `contato_id` e monta uma mensagem por cliente.
--
-- `texto_do_ponto` vem do feedback daquele MESMO contato. Uma acao nasce de
-- reclamacoes de varias pessoas, e mostrar o comentario de um cliente para
-- outro seria vazamento de dado alheio — por isso o join amarra
-- `feedbacks_restaurante.contato_id` ao dono do aviso, e nao so a acao.
create or replace view public.fila_retorno_n8n as
select
  a.id                as aviso_id,
  a.contato_id,
  c.telefone,
  c.nome              as nome_cliente,
  a.restaurante_id,
  r.nome_restaurante,
  r.whatsapp_token,
  r.whatsapp_base_url,
  a.acao_id,
  ac.titulo_acao,
  ac.categoria,
  ac.plano_detalhado,
  a.etapa,                       -- 'em_andamento' | 'concluida'
  a.feedback_restaurante_id,
  fr.texto_original   as texto_do_ponto,
  fr.categoria        as categoria_do_ponto,
  fo.id               as feedback_original_id,
  fo.created_at       as feedback_em,
  a.criado_em         as aviso_em,
  c.ultimo_envio_em
from public.aviso_pendente a
join public.contatos c        on c.id = a.contato_id
join public.restaurantes r    on r.id = a.restaurante_id
join public.acoes_operacionais ac on ac.id = a.acao_id
left join public.feedbacks_restaurante fr on fr.id = a.feedback_restaurante_id
                                         and fr.contato_id = a.contato_id
left join public.feedbacks_originais fo   on fo.id = fr.origem_id
where a.status = 'na_fila'
  and a.expira_em > now()
  and c.opt_out_em is null
  and r.excluida_em is null
  and r.assinatura_status = 'ativa'
  and coalesce((r.config_insights -> 'motor_resposta' ->> 'ativo')::boolean, false) = true
  -- A carencia: nunca duas mensagens ao mesmo cliente dentro de cooldown_dias.
  and (
    c.ultimo_envio_em is null
    or c.ultimo_envio_em <= now() - make_interval(
         days => coalesce((r.config_insights -> 'motor_resposta' ->> 'cooldown_dias')::int, 3))
  );

comment on view public.fila_retorno_n8n is
  'Avisos prontos para o n8n entregar. Uma linha por feedback avisado; agrupe por contato_id. Ja filtra opt-out, assinatura, motor ligado e a carencia de cooldown_dias.';

-- ---------------------------------------------------------------------------
-- 3. O registro do envio, numa transacao so
-- ---------------------------------------------------------------------------
-- O n8n poderia fazer tres updates soltos (data no contato, avisos como
-- enviados, mensagem no historico). Se ele falhasse no meio, o estado ficaria
-- incoerente do pior jeito: avisos consumidos sem carencia registrada faz o
-- cliente receber de novo amanha; carencia registrada sem avisos consumidos faz
-- os mesmos avisos voltarem na proxima rodada.
--
-- Uma funcao resolve os tres de uma vez, e e idempotente: chamar de novo com os
-- mesmos ids nao faz nada, porque os avisos ja sairam de 'na_fila'.
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
as $$
declare
  v_restaurante bigint;
  v_mensagem uuid;
  v_originais uuid[];
  v_pontos bigint[];
begin
  select restaurante_id into v_restaurante
    from public.aviso_pendente
   where id = any(p_aviso_ids) and status = 'na_fila'
   limit 1;

  -- Nenhum aviso valido: provavelmente um retry depois de ja ter registrado.
  if v_restaurante is null then
    return null;
  end if;

  -- O rastro: de quais feedbacks esta mensagem falou.
  select coalesce(array_agg(distinct fo), '{}'), coalesce(array_agg(distinct fp), '{}')
    into v_originais, v_pontos
    from public.aviso_pendente a,
         lateral unnest(coalesce(a.feedbacks_originais_ids, '{}')) fo,
         lateral unnest(coalesce(a.feedbacks_restaurante_ids, array[]::bigint[])) fp
   where a.id = any(p_aviso_ids);

  insert into public.mensagem_enviada
    (contato_id, restaurante_id, texto, status, enviado_em, provider_message_id,
     feedbacks_originais_ids, feedbacks_restaurante_ids)
  values
    (p_contato_id, v_restaurante, p_texto, 'enviado', now(), p_provider_message_id,
     coalesce(v_originais, '{}'), coalesce(v_pontos, '{}'))
  returning id into v_mensagem;

  update public.aviso_pendente
     set status = 'enviado', mensagem_id = v_mensagem
   where id = any(p_aviso_ids) and status = 'na_fila';

  -- O relogio da carencia so anda aqui, depois do envio confirmado.
  update public.contatos set ultimo_envio_em = now() where id = p_contato_id;

  return v_mensagem;
end;
$$;

comment on function public.registrar_envio_retorno(uuid, text, uuid[], text) is
  'Chamada pelo n8n DEPOIS de entregar no WhatsApp: grava a mensagem, marca os avisos como enviados e move o relogio da carencia. Atomica e idempotente.';

-- ---------------------------------------------------------------------------
-- 4. Fim do motor antigo
-- ---------------------------------------------------------------------------
-- `janela_contato` guardava a carencia e o lock por contato. A carencia mudou
-- para `contatos.ultimo_envio_em` e o lock nao existe mais (nao ha worker
-- concorrente). A tabela estava vazia — nada a migrar.
drop view if exists public.fila_envio_n8n;
drop function if exists public.motor_confirmar_envio(uuid, text);
drop function if exists public.motor_falhar_envio(uuid, text, text);
drop function if exists public.motor_tomar_lock_contato(uuid, bigint, integer);
drop function if exists public.motor_soltar_lock_contato(uuid, uuid);
drop table if exists public.janela_contato;
