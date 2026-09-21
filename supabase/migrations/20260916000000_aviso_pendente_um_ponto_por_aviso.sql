-- =============================================================================
-- aviso_pendente: um aviso = um ponto de feedback, de um cliente, sobre uma
-- etapa de uma ação.
--
-- O que muda, e por quê:
--
-- 1. Aviso cancelado ou vencido não trava mais o próximo.
--    O índice único valia para qualquer status. O dono move o card para "em
--    andamento", depois de 2 h volta para "pendente" (aviso cancelado) e mais
--    tarde move de novo: o aviso novo batia no cancelado e o cliente nunca
--    sabia. Agora a trava só vale entre avisos vivos (na_fila / enviado) —
--    o que já foi enviado continua impedindo mensagem repetida.
--
-- 2. Todo aviso tem ponto (`feedback_restaurante_id not null`).
--    Aviso sem ponto vinha dos vínculos antigos de `feedback_acao` (backfill de
--    25/08), que ligam o cliente a ações sem relação com o que ele disse. Eles
--    não geram mais aviso; a única linha antiga (vencida) ganha o ponto que já
--    estava no array dela.
--
-- 3. Saem `feedbacks_originais_ids` e `feedbacks_restaurante_ids`.
--    Com um ponto por aviso, os dois arrays tinham sempre 1 item, igual a
--    `feedback_restaurante_id` e à origem dele. `mensagem_enviada` continua com
--    os arrays (uma mensagem cobre vários pontos), montados pelo join.
--
-- 4. Feedback desligado da ação cancela o aviso que ainda está na fila.
--    Antes o cliente seria avisado de uma ação que não tem mais o feedback dele.
--
-- 5. Confirmação do n8n não perde envio.
--    Se o dono desfaz o card ou o aviso vence nos minutos entre o n8n ler a fila
--    e confirmar, a mensagem já saiu — mas a confirmação devolvia null, sem
--    histórico e sem `ultimo_envio_em`, e o cliente podia receber de novo no dia
--    seguinte. Repetir a chamada continua devolvendo null.
--
-- 6. Coerência, índices e permissões: o ponto precisa ser do mesmo cliente e
--    restaurante; FKs indexadas; o site (anon/authenticated) não escreve aqui.
--
-- 7. Sai `cancelar_avisos_acao_removida`: marcava "cancelado" em avisos que o
--    ON DELETE CASCADE apaga logo em seguida.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 e 2. Trava só entre avisos vivos; ponto obrigatório
-- ---------------------------------------------------------------------------
drop index if exists public.aviso_pendente_unico;
drop index if exists public.aviso_pendente_unico_por_ponto;
drop index if exists public.aviso_pendente_unico_legado;

update public.aviso_pendente
   set feedback_restaurante_id = feedbacks_restaurante_ids[1]
 where feedback_restaurante_id is null
   and cardinality(feedbacks_restaurante_ids) = 1;

alter table public.aviso_pendente
  alter column feedback_restaurante_id set not null;

-- O ponto já identifica o cliente: não precisa de contato_id na chave, e uma
-- mescla de contatos não gera conflito.
create unique index aviso_pendente_unico_vivo
  on public.aviso_pendente (feedback_restaurante_id, acao_id, etapa)
  where status in ('na_fila', 'enviado');

-- ---------------------------------------------------------------------------
-- 6. Regras que o banco garante
-- ---------------------------------------------------------------------------
alter table public.aviso_pendente
  drop constraint if exists aviso_pendente_expira_depois_de_criar,
  add  constraint aviso_pendente_expira_depois_de_criar check (expira_em > criado_em);

-- Só aviso enviado aponta para mensagem. (O contrário não dá para exigir: apagar
-- a mensagem põe mensagem_id em null.)
alter table public.aviso_pendente
  drop constraint if exists aviso_pendente_mensagem_so_se_enviado,
  add  constraint aviso_pendente_mensagem_so_se_enviado check (mensagem_id is null or status = 'enviado');

-- FKs sem índice fazem varredura da tabela inteira a cada exclusão em cascata.
create index if not exists idx_aviso_pendente_contato  on public.aviso_pendente (contato_id);
create index if not exists idx_aviso_pendente_acao     on public.aviso_pendente (acao_id);
create index if not exists idx_aviso_pendente_ponto    on public.aviso_pendente (feedback_restaurante_id);
create index if not exists idx_aviso_pendente_mensagem on public.aviso_pendente (mensagem_id) where mensagem_id is not null;

create or replace function public.validar_coerencia_aviso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.contatos c
     where c.id = new.contato_id and c.restaurante_id = new.restaurante_id
  ) then
    raise exception 'aviso: contato % nao e do restaurante %',
      new.contato_id, new.restaurante_id using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.acoes_operacionais a
     where a.id = new.acao_id and a.restaurante_id = new.restaurante_id
  ) then
    raise exception 'aviso: acao % nao e do restaurante %',
      new.acao_id, new.restaurante_id using errcode = 'check_violation';
  end if;

  -- A fila só mostra o texto do ponto quando ele é do próprio contato. Um
  -- aviso com ponto de outra pessoa sairia sem texto — ou com o texto errado.
  if not exists (
    select 1 from public.feedbacks_restaurante fr
     where fr.id = new.feedback_restaurante_id
       and fr.contato_id = new.contato_id
       and fr.restaurante_id = new.restaurante_id
  ) then
    raise exception 'aviso: ponto % nao e do contato % no restaurante %',
      new.feedback_restaurante_id, new.contato_id, new.restaurante_id using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_aviso_validar_coerencia on public.aviso_pendente;
create trigger trg_aviso_validar_coerencia
  before insert or update of contato_id, acao_id, restaurante_id, feedback_restaurante_id
  on public.aviso_pendente
  for each row execute function public.validar_coerencia_aviso();

-- ---------------------------------------------------------------------------
-- 2 e 3. Quem cria aviso: sem arrays, sempre com ponto
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

    -- Vínculo sem ponto (backfill antigo) não gera aviso: não dá para saber o
    -- que o cliente disse sobre esta ação.
    with novos as (
      insert into public.aviso_pendente
        (contato_id, restaurante_id, acao_id, etapa, expira_em, feedback_restaurante_id)
      select fr.contato_id, r.restaurante_id, r.acao_id, v_etapa,
             now() + make_interval(days => coalesce(v_expira, 14)),
             fr.id
        from public.feedback_acao fa
        join public.feedbacks_restaurante fr on fr.id = fa.feedback_restaurante_id
        join public.contatos c               on c.id  = fr.contato_id
       where fa.acao_id = r.acao_id
         and fr.restaurante_id = r.restaurante_id
         and c.restaurante_id  = r.restaurante_id
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
  if new.feedback_restaurante_id is null then
    return null;
  end if;

  begin
    select a.status into v_status
      from public.acoes_operacionais a
     where a.id = new.acao_id
       and a.restaurante_id = new.restaurante_id;

    if v_status is null or v_status not in ('EM_ANDAMENTO', 'CONCLUIDO') then
      return null;
    end if;

    select h.status_para, h.promovido_em, h.cancelado_em, h.criado_em
      into v_etapa
      from public.acao_status_historico h
     where h.acao_id = new.acao_id
     order by h.id desc
     limit 1;

    -- Mudança ainda dentro das 2 h: o cron vai criar o aviso quando promover.
    if v_etapa.status_para is distinct from v_status
       or v_etapa.promovido_em is null
       or v_etapa.cancelado_em is not null then
      return null;
    end if;

    select fr.contato_id, fo.created_at into v_contato, v_chegou
      from public.feedbacks_restaurante fr
      join public.feedbacks_originais fo on fo.id = fr.origem_id
      join public.contatos c             on c.id  = fr.contato_id
     where fr.id = new.feedback_restaurante_id
       and fr.restaurante_id = new.restaurante_id
       and c.restaurante_id  = new.restaurante_id
       and c.opt_out_em is null;

    if v_contato is null then
      return null;
    end if;

    -- Reclamação que chegou depois de a ação ser concluída não recebe
    -- "resolvido": o problema voltou a acontecer.
    if v_status = 'CONCLUIDO' and v_chegou > v_etapa.criado_em then
      return null;
    end if;

    select coalesce((r.config_insights -> 'motor_resposta' ->> 'expira_aviso_dias')::int, 14)
      into v_expira
      from public.restaurantes r where r.id = new.restaurante_id;

    insert into public.aviso_pendente
      (contato_id, restaurante_id, acao_id, etapa, expira_em, feedback_restaurante_id)
    values (
      v_contato, new.restaurante_id, new.acao_id,
      case when v_status = 'EM_ANDAMENTO'
           then 'em_andamento'::public.aviso_etapa
           else 'concluida'::public.aviso_etapa end,
      now() + make_interval(days => coalesce(v_expira, 14)),
      new.feedback_restaurante_id
    )
    on conflict do nothing;
  exception when others then
    raise warning 'avisar_vinculo_tardio (acao %): %', new.acao_id, sqlerrm;
  end;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Confirmação do n8n
-- ---------------------------------------------------------------------------
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
  -- Trava o contato: duas confirmações ao mesmo tempo gravariam duas mensagens.
  select c.restaurante_id into v_restaurante
    from public.contatos c
   where c.id = p_contato_id
     for update;

  if v_restaurante is null then
    return null;
  end if;

  -- Chamada repetida (retry do n8n): algum aviso da lista já aponta para uma
  -- mensagem. Todos saíram da fila juntos, então a lista já foi confirmada.
  if exists (
    select 1 from public.aviso_pendente a
     where a.id = any(p_aviso_ids)
       and a.contato_id = p_contato_id
       and a.mensagem_id is not null
  ) then
    return null;
  end if;

  -- Não filtra por status: se o dono desfez o card ou o aviso venceu entre a
  -- leitura da fila e agora, a mensagem já chegou ao cliente do mesmo jeito.
  select coalesce(array_agg(distinct fr.origem_id), '{}'),
         coalesce(array_agg(distinct a.feedback_restaurante_id), '{}')
    into v_originais, v_pontos
    from public.aviso_pendente a
    join public.feedbacks_restaurante fr on fr.id = a.feedback_restaurante_id
   where a.id = any(p_aviso_ids)
     and a.contato_id = p_contato_id;

  if cardinality(v_pontos) = 0 then
    return null;
  end if;

  insert into public.mensagem_enviada
    (contato_id, restaurante_id, texto, status, enviado_em, provider_message_id,
     feedbacks_originais_ids, feedbacks_restaurante_ids)
  values
    (p_contato_id, v_restaurante, p_texto, 'enviado', now(), p_provider_message_id,
     v_originais, v_pontos)
  returning id into v_mensagem;

  -- Um aviso cancelado cujo lugar já foi tomado por outro vivo (mesmo ponto,
  -- ação e etapa) fica como está: marcá-lo quebraria a trava de avisos vivos.
  update public.aviso_pendente a
     set status = 'enviado', mensagem_id = v_mensagem
   where a.id = any(p_aviso_ids)
     and a.contato_id = p_contato_id
     and a.mensagem_id is null
     and (a.status in ('na_fila', 'enviado')
          or not exists (
            select 1 from public.aviso_pendente b
             where b.feedback_restaurante_id = a.feedback_restaurante_id
               and b.acao_id = a.acao_id
               and b.etapa   = a.etapa
               and b.status in ('na_fila', 'enviado')
               and b.id <> a.id
          ));

  update public.contatos set ultimo_envio_em = now() where id = p_contato_id;

  return v_mensagem;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Arrays redundantes
-- ---------------------------------------------------------------------------
alter table public.aviso_pendente
  drop column if exists feedbacks_originais_ids,
  drop column if exists feedbacks_restaurante_ids;

-- ---------------------------------------------------------------------------
-- 4. Feedback desligado da ação
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_aviso_de_vinculo_removido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.feedback_restaurante_id is null then
    return null;
  end if;

  -- Quando o vínculo some porque a ação ou o ponto foram apagados, o cascade já
  -- leva os avisos junto; não há o que cancelar.
  if not exists (select 1 from public.acoes_operacionais where id = old.acao_id)
     or not exists (select 1 from public.feedbacks_restaurante where id = old.feedback_restaurante_id) then
    return null;
  end if;

  update public.aviso_pendente
     set status = 'cancelado'
   where acao_id = old.acao_id
     and feedback_restaurante_id = old.feedback_restaurante_id
     and status = 'na_fila';

  return null;
end;
$function$;

drop trigger if exists trg_feedback_acao_cancelar_aviso on public.feedback_acao;
create trigger trg_feedback_acao_cancelar_aviso
  after delete on public.feedback_acao
  for each row execute function public.cancelar_aviso_de_vinculo_removido();

-- ---------------------------------------------------------------------------
-- 7. Trigger que não fazia nada
-- ---------------------------------------------------------------------------
drop trigger if exists trg_acoes_cancelar_avisos on public.acoes_operacionais;
drop function if exists public.cancelar_avisos_acao_removida();

-- ---------------------------------------------------------------------------
-- 6. Permissões: quem escreve aqui são as funções acima e o service_role
-- ---------------------------------------------------------------------------
revoke all on table public.aviso_pendente from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.aviso_pendente from authenticated;

-- ---------------------------------------------------------------------------
-- Conferência final: nada incoerente sobrou
-- ---------------------------------------------------------------------------
do $conferir$
declare
  v_ruins int;
begin
  select count(*) into v_ruins
    from public.aviso_pendente a
    left join public.feedbacks_restaurante fr on fr.id = a.feedback_restaurante_id
    left join public.contatos c               on c.id  = a.contato_id
    left join public.acoes_operacionais ac    on ac.id = a.acao_id
   where fr.id is null
      or fr.contato_id is distinct from a.contato_id
      or fr.restaurante_id <> a.restaurante_id
      or c.restaurante_id  <> a.restaurante_id
      or ac.restaurante_id <> a.restaurante_id;

  if v_ruins > 0 then
    raise exception 'aviso_pendente: % aviso(s) incoerente(s)', v_ruins;
  end if;
end
$conferir$;
