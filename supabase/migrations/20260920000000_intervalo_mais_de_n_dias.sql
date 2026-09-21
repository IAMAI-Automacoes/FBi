-- =============================================================================
-- Intervalo entre mensagens: "mais de N dias", e não "N dias ou mais".
--
-- Com N = 3, o cliente que recebeu na segunda só volta à fila na sexta. Antes
-- voltava na quinta.
--
-- O n8n aplica essa mesma conta do lado dele (`$today.minus({ days: 3 })`), e a
-- fila aqui precisa dizer a mesma coisa: dois números diferentes para a mesma
-- regra é armadilha na hora de conferir por que alguém recebeu ou não.
--
-- Só muda o `>=` para `>` no filtro da carência. Todo o resto da view é igual.
-- =============================================================================

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
           > coalesce((r.config_insights -> 'motor_resposta' ->> 'cooldown_dias')::int, 3));

comment on view public.fila_retorno_n8n is
  'Avisos prontos para o n8n entregar. Uma linha por feedback avisado; agrupe por contato_id. Ja filtra opt-out, assinatura, motor ligado e a carencia: precisa ter passado MAIS de cooldown_dias desde a ultima mensagem.';
