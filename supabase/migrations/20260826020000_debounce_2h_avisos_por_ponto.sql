-- Debounce real de 2h e um aviso por FEEDBACK, não por cliente.
--
-- ## Debounce: de filtro para criação adiada
--
-- Hoje o aviso nasce no instante da transição e o worker apenas o IGNORA
-- enquanto tiver menos de 2h de vida (`criado_em <= now()-2h`). Funciona para
-- não mandar mensagem cedo demais, mas deixa lixo: o dono arrasta o card
-- errado, corrige em 30 segundos, e mesmo assim ficou uma linha `cancelado` na
-- fila para sempre.
--
-- A regra pedida é outra: a contagem de 2h roda ANTES de existir aviso. Se
-- reverter dentro da janela, nada chega a ser criado.
--
-- A área de espera é `acao_status_historico`, que já registra toda transição —
-- é uma coluna de prazo, não uma tabela nova.
--
-- ## Reversão detectada por ESTADO, não por evento
--
-- A promoção compara o status ATUAL da ação com o `status_para` daquela
-- transição, usando uma ordem (PENDENTE < EM_ANDAMENTO < CONCLUIDO):
--
--   - status atual >= status_para  -> promove (a ação chegou lá e continua lá,
--                                     ou até avançou mais)
--   - status atual <  status_para  -> cancela (voltou atrás)
--
-- Comparar por ordem, e não por igualdade, é o que faz o caso "começou e
-- concluiu dentro das mesmas 2h" gerar as DUAS etapas em vez de perder a
-- primeira. E, sendo baseado em estado, reverter e re-avançar dentro da janela
-- dá o resultado certo sem precisar rastrear a sequência de eventos.
--
-- ## Um aviso por ponto
--
-- O índice único era `(contato_id, acao_id, etapa)` — um aviso por cliente. A
-- regra nova é uma linha por feedback separado, cada uma carregando o cliente,
-- para o n8n conseguir agrupar por pessoa na hora de montar a mensagem.

-- ---------------------------------------------------------------------------
-- 1. Área de espera das transições
-- ---------------------------------------------------------------------------

alter table public.acao_status_historico
  add column if not exists promover_em  timestamptz,
  add column if not exists promovido_em timestamptz,
  add column if not exists cancelado_em timestamptz;

create index if not exists idx_hist_a_promover
  on public.acao_status_historico (promover_em)
  where promovido_em is null and cancelado_em is null;

-- ---------------------------------------------------------------------------
-- 2. aviso_pendente: uma linha por ponto
-- ---------------------------------------------------------------------------

alter table public.aviso_pendente
  add column if not exists feedback_restaurante_id bigint references public.feedbacks_restaurante(id) on delete cascade;

drop index if exists public.aviso_pendente_unico;

-- Dois índices parciais em vez de NULLS NOT DISTINCT: independe da versão do
-- Postgres e deixa explícito que há dois regimes (com e sem ponto conhecido).
create unique index if not exists aviso_pendente_unico_por_ponto
  on public.aviso_pendente (contato_id, acao_id, etapa, feedback_restaurante_id)
  where feedback_restaurante_id is not null;

create unique index if not exists aviso_pendente_unico_legado
  on public.aviso_pendente (contato_id, acao_id, etapa)
  where feedback_restaurante_id is null;

-- ---------------------------------------------------------------------------
-- 3. Ordem dos status, para comparar avanço com regressão
-- ---------------------------------------------------------------------------

create or replace function public.ordem_status_acao(p_status text)
returns int
language sql
immutable
as $$
  select case p_status
           when 'SUGERIDA'     then 0
           when 'PENDENTE'     then 1
           when 'EM_ANDAMENTO' then 2
           when 'CONCLUIDO'    then 3
           else -1
         end;
$$;

-- Sobrecarga para o enum `aviso_etapa`, cujos valores são minúsculos
-- ('em_andamento') e portanto NÃO casam com o texto do status ('EM_ANDAMENTO').
-- Sem ela, comparar etapa com status cairia no `else -1` e o cancelamento por
-- regressão nunca dispararia — silenciosamente.
create or replace function public.ordem_status_acao(p_etapa public.aviso_etapa)
returns int
language sql
immutable
as $$
  select case p_etapa
           when 'em_andamento' then 2
           when 'concluida'    then 3
         end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A transição só AGENDA; não cria mais aviso
-- ---------------------------------------------------------------------------

create or replace function public.processar_transicao_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_espera_horas numeric;
begin
  if old.status is not distinct from new.status then
    return null;
  end if;

  select coalesce(
           (r.config_insights -> 'motor_resposta' ->> 'debounce_horas')::numeric,
           2)
    into v_espera_horas
    from public.restaurantes r
   where r.id = new.restaurante_id;

  insert into public.acao_status_historico
    (acao_id, restaurante_id, status_de, status_para, promover_em)
  values (
    new.id, new.restaurante_id, old.status, new.status,
    -- Só avanço para EM_ANDAMENTO/CONCLUIDO tem o que comunicar. As demais
    -- transições entram no histórico sem prazo: viram registro, nunca mensagem.
    case when new.status in ('EM_ANDAMENTO', 'CONCLUIDO')
         then now() + make_interval(hours => coalesce(v_espera_horas, 2)::int)
         else null end
  );

  -- Regressão: mata o que ainda não virou aviso...
  if public.ordem_status_acao(new.status) < public.ordem_status_acao(old.status) then
    update public.acao_status_historico h
       set cancelado_em = now()
     where h.acao_id = new.id
       and h.promovido_em is null
       and h.cancelado_em is null
       and h.promover_em is not null
       and public.ordem_status_acao(h.status_para) > public.ordem_status_acao(new.status);

    -- ...e o que já virou.
    update public.aviso_pendente a
       set status = 'cancelado'
     where a.acao_id = new.id
       and a.status = 'na_fila'
       and public.ordem_status_acao(a.etapa) > public.ordem_status_acao(new.status);
  end if;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. A promoção: cumpriu o prazo e não voltou atrás -> vira aviso
-- ---------------------------------------------------------------------------
-- Chamada pelo `motor-retorno-worker`, que já roda a cada 5 min — uma peça
-- móvel a menos do que um cron próprio.

create or replace function public.promover_transicoes_pendentes()
returns table (promovidas bigint, canceladas bigint, avisos_criados bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_promovidas bigint := 0;
  v_canceladas bigint := 0;
  v_avisos     bigint := 0;
  r            record;
  v_etapa      public.aviso_etapa;
  v_expira     int;
  v_inseridos  bigint;
begin
  -- Voltou atrás antes de vencer o prazo: nunca vira aviso.
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
       -- Continua no marco (ou passou dele): não houve regressão.
       and public.ordem_status_acao(a.status) >= public.ordem_status_acao(h.status_para)
     order by h.criado_em
  loop
    v_etapa := case when r.status_para = 'EM_ANDAMENTO'
                    then 'em_andamento'::public.aviso_etapa
                    else 'concluida'::public.aviso_etapa end;

    select coalesce((cfg.config_insights -> 'motor_resposta' ->> 'expira_aviso_dias')::int, 14)
      into v_expira
      from public.restaurantes cfg where cfg.id = r.restaurante_id;

    -- Uma linha por PONTO ligado à ação, cada uma com o cliente dono dele.
    with novos as (
      insert into public.aviso_pendente
        (contato_id, restaurante_id, acao_id, etapa, expira_em,
         feedback_restaurante_id, feedbacks_originais_ids, feedbacks_restaurante_ids)
      select fo.contato_id,
             r.restaurante_id,
             r.acao_id,
             v_etapa,
             now() + make_interval(days => coalesce(v_expira, 14)),
             fa.feedback_restaurante_id,
             array[fo.id],
             case when fa.feedback_restaurante_id is null
                  then '{}'::bigint[]
                  else array[fa.feedback_restaurante_id] end
        from public.feedback_acao fa
        join public.feedbacks_originais fo on fo.id = fa.feedback_original_id
        join public.contatos c            on c.id  = fo.contato_id
       where fa.acao_id = r.acao_id
         and fo.contato_id is not null
         -- Quem pediu para sair não entra na fila.
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
$fn$;
