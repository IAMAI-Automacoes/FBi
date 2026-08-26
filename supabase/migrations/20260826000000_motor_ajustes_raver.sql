-- Três ajustes pedidos pelo dono do produto (Raver) sobre o motor de resposta:
--
-- 1. O aviso pendente e a mensagem final passam a guardar, como coluna própria
--    (não só recuperável por join), os ids dos feedbacks ORIGINAIS e dos
--    feedbacks SEPARADOS que motivaram aquele aviso/mensagem — rastro
--    explícito na própria linha, sabendo que um original pode ter virado mais
--    de um separado e mais de uma ação.
--
-- 2. O transporte muda de EMPURRAR (worker chama webhook do n8n) para o n8n
--    PUXAR: o worker só COMPÕE a mensagem e marca como 'pronta'; o n8n, na
--    própria rotina diária, lê a view `fila_envio_n8n`, envia, e confirma
--    chamando `motor-retorno-callback` (que já existia e já era assim).
--
-- 3. Uma transição de status só vira candidata a mensagem depois de 2 horas
--    "quietas" (sem terem revertido) — implementado como filtro no worker
--    (não aqui: não há coluna nova para isso, é só WHERE criado_em <= agora -
--    2h). O cancelamento ao reverter já existia e continua valendo IGUAL
--    antes ou depois dessas 2h — só desliga o "esperar" quando o status volta.

-- ---------------------------------------------------------------------------
-- 1. Rastro de feedbacks direto na linha
-- ---------------------------------------------------------------------------

alter table public.aviso_pendente
  add column if not exists feedbacks_originais_ids   uuid[]   not null default '{}',
  add column if not exists feedbacks_restaurante_ids bigint[] not null default '{}';

alter table public.mensagem_enviada
  add column if not exists feedbacks_originais_ids   uuid[]   not null default '{}',
  add column if not exists feedbacks_restaurante_ids bigint[] not null default '{}';

-- Mesma trigger de antes (20260825030000), só o INSERT do aviso_pendente
-- muda: de `select distinct` (sem agregação) para `group by` + `array_agg`,
-- pra sair com os dois arrays por (contato, ação). O `left join` em
-- feedbacks_restaurante pega os pedaços separados que ESTA ação já consumiu
-- (usado_por_acao_id = new.id) e que vieram do mesmo original.
create or replace function public.processar_transicao_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_expira_dias int;
  v_etapa       public.aviso_etapa;
begin
  if old.status is not distinct from new.status then
    return null;
  end if;

  insert into public.acao_status_historico (acao_id, restaurante_id, status_de, status_para)
  values (new.id, new.restaurante_id, old.status, new.status);

  if new.restaurante_id is null then
    return null;
  end if;

  if new.status in ('EM_ANDAMENTO', 'CONCLUIDO') then
    v_etapa := case when new.status = 'EM_ANDAMENTO'
                    then 'em_andamento'::public.aviso_etapa
                    else 'concluida'::public.aviso_etapa end;

    select coalesce(
             (r.config_insights -> 'motor_resposta' ->> 'expira_aviso_dias')::int,
             14)
      into v_expira_dias
      from public.restaurantes r
     where r.id = new.restaurante_id;

    insert into public.aviso_pendente
      (contato_id, restaurante_id, acao_id, etapa, expira_em,
       feedbacks_originais_ids, feedbacks_restaurante_ids)
    select
           fo.contato_id,
           new.restaurante_id,
           new.id,
           v_etapa,
           now() + make_interval(days => coalesce(v_expira_dias, 14)),
           array_agg(distinct fo.id),
           coalesce(array_agg(distinct fr.id) filter (where fr.id is not null), '{}')
      from public.feedback_acao fa
      join public.feedbacks_originais fo on fo.id = fa.feedback_original_id
      join public.contatos c            on c.id  = fo.contato_id
      left join public.feedbacks_restaurante fr
        on fr.origem_id = fo.id and fr.usado_por_acao_id = new.id
     where fa.acao_id = new.id
       and fo.contato_id is not null
       and c.opt_out_em is null
     group by fo.contato_id
    on conflict (contato_id, acao_id, etapa) do nothing;

  else
    update public.aviso_pendente
       set status = 'cancelado'
     where acao_id = new.id
       and status  = 'na_fila';
  end if;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Transporte: worker compõe e marca 'pronta'; n8n lê e confirma
-- ---------------------------------------------------------------------------

alter table public.mensagem_enviada drop constraint if exists mensagem_enviada_status_check;
alter table public.mensagem_enviada add constraint mensagem_enviada_status_check
  check (status in ('pronta', 'enviando', 'enviado', 'falhou', 'simulado'));

-- As RPCs de confirmação/falha aceitavam só 'enviando' (o estado que o worker
-- escrevia quando ele mesmo entregava ao n8n). Agora o worker escreve 'pronta'
-- e quem avança pra 'enviando'/direto pra 'enviado' é o n8n, então as duas
-- aceitam os dois estados de origem.
create or replace function public.motor_confirmar_envio(
  p_mensagem_id uuid,
  p_provider_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contato uuid;
begin
  update public.mensagem_enviada
     set status              = 'enviado',
         enviado_em          = now(),
         provider_message_id = coalesce(p_provider_id, provider_message_id)
   where id = p_mensagem_id
     and status in ('pronta', 'enviando')
  returning contato_id into v_contato;

  if v_contato is null then
    return;
  end if;

  update public.aviso_pendente
     set status = 'enviado'
   where mensagem_id = p_mensagem_id
     and status = 'na_fila';

  insert into public.janela_contato (contato_id, restaurante_id, ultimo_envio_em)
  select v_contato, m.restaurante_id, now()
    from public.mensagem_enviada m
   where m.id = p_mensagem_id
  on conflict (contato_id) do update
    set ultimo_envio_em = now(),
        lock_ate        = null,
        lock_dono       = null;
end;
$fn$;

create or replace function public.motor_falhar_envio(
  p_mensagem_id uuid,
  p_codigo      text default null,
  p_mensagem    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contato uuid;
begin
  update public.mensagem_enviada
     set status        = 'falhou',
         erro_codigo   = p_codigo,
         erro_mensagem = left(coalesce(p_mensagem, ''), 500)
   where id = p_mensagem_id
     and status in ('pronta', 'enviando')
  returning contato_id into v_contato;

  if v_contato is null then
    return;
  end if;

  update public.aviso_pendente
     set mensagem_id = null
   where mensagem_id = p_mensagem_id
     and status = 'na_fila';

  update public.janela_contato
     set lock_ate = null, lock_dono = null
   where contato_id = v_contato;
end;
$fn$;

-- View plana pro n8n ler direto (via REST, com a service key) sem precisar
-- montar join nenhum: uma linha = uma mensagem pronta pra sair, com telefone,
-- credenciais do WhatsApp daquele restaurante e o rastro de feedbacks.
create or replace view public.fila_envio_n8n as
select
  m.id                as mensagem_id,
  m.restaurante_id,
  r.nome_restaurante  as restaurante_nome,
  r.whatsapp_token,
  r.whatsapp_base_url,
  m.contato_id,
  c.telefone,
  m.texto,
  m.feedbacks_originais_ids,
  m.feedbacks_restaurante_ids,
  m.criado_em
from public.mensagem_enviada m
join public.contatos     c on c.id = m.contato_id
join public.restaurantes r on r.id = m.restaurante_id
where m.status = 'pronta';
