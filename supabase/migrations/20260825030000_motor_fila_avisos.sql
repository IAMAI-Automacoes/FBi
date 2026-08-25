-- Núcleo do motor de resposta: histórico de status, fila de avisos, cooldown e
-- log de mensagens.
--
-- O conceito central é o AVISO PENDENTE. A transição de status é um instante:
-- acontece e passa. Mas o desenho manda esperar até 72h antes de comunicar, e o
-- campo `status` da ação não serve de memória — ele guarda onde a ação está
-- agora, não quem já foi avisado de quê. O aviso pendente é a linha que diz
-- "a ação 7 entrou em EM_ANDAMENTO, a Maria precisa saber, ainda não avisamos".

-- ---------------------------------------------------------------------------
-- Histórico de transições
-- ---------------------------------------------------------------------------
-- `atualizarStatusAcao` (src/lib/queries/acoes.ts:55) faz UPDATE direto e o
-- status anterior se perde. Sem histórico não há como auditar o que foi
-- enviado e por quê, nem reconstruir a fila depois de um incidente.

create table if not exists public.acao_status_historico (
  id             bigint generated always as identity primary key,
  acao_id        bigint not null references public.acoes_operacionais(id) on delete cascade,
  restaurante_id bigint,
  status_de      text,
  status_para    text not null,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_acao_hist_acao
  on public.acao_status_historico (acao_id, criado_em desc);

alter table public.acao_status_historico enable row level security;

drop policy if exists tenant_isolation_select on public.acao_status_historico;
create policy tenant_isolation_select on public.acao_status_historico
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ---------------------------------------------------------------------------
-- Fila de avisos
-- ---------------------------------------------------------------------------

do $criar_etapa$ begin
  create type public.aviso_etapa as enum ('em_andamento', 'concluida');
exception when duplicate_object then null; end $criar_etapa$;

do $criar_status$ begin
  create type public.aviso_status as enum ('na_fila', 'enviado', 'cancelado', 'expirado');
exception when duplicate_object then null; end $criar_status$;

create table if not exists public.aviso_pendente (
  id             uuid primary key default gen_random_uuid(),
  contato_id     uuid   not null references public.contatos(id)           on delete cascade,
  restaurante_id bigint not null references public.restaurantes(id)       on delete cascade,
  acao_id        bigint not null references public.acoes_operacionais(id) on delete cascade,
  etapa          public.aviso_etapa  not null,
  status         public.aviso_status not null default 'na_fila',
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  mensagem_id    uuid
);

-- A trava que sustenta duas invariantes de uma vez:
--   I4 — N feedbacks da mesma pessoa na MESMA ação geram UM aviso, não N.
--   I6 — transições concorrentes ou reprocessamento não duplicam mensagem.
-- Sem este índice, ambas dependeriam de o código lembrar de checar. Com ele, o
-- banco recusa.
create unique index if not exists aviso_pendente_unico
  on public.aviso_pendente (contato_id, acao_id, etapa);

-- Consulta quente do worker: "quem tem fila neste restaurante?".
create index if not exists aviso_pendente_fila
  on public.aviso_pendente (restaurante_id, contato_id, criado_em)
  where status = 'na_fila';

alter table public.aviso_pendente enable row level security;

drop policy if exists tenant_isolation_select on public.aviso_pendente;
create policy tenant_isolation_select on public.aviso_pendente
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ---------------------------------------------------------------------------
-- Cooldown
-- ---------------------------------------------------------------------------
-- UMA linha por contato. Sem coluna de etapa — o cooldown é único (I1).
--
-- Um cooldown por etapa permitiria duas mensagens em 72h, e coladas: a fila
-- esvazia só com avisos de em_andamento, uma ação conclui 1h depois, o cooldown
-- de "concluida" está livre, e sai a segunda mensagem em 90 minutos. É o bug
-- original voltando por outro caminho. Não reintroduzir.

create table if not exists public.janela_contato (
  contato_id      uuid primary key references public.contatos(id) on delete cascade,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  ultimo_envio_em timestamptz
);

alter table public.janela_contato enable row level security;

drop policy if exists tenant_isolation_select on public.janela_contato;
create policy tenant_isolation_select on public.janela_contato
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ---------------------------------------------------------------------------
-- Log de mensagens enviadas
-- ---------------------------------------------------------------------------
-- Hoje não existe registro nenhum do que sai: a falha some no
-- `.catch(console.error)` do browser (TaskBoard.tsx:375). Sem log não há como
-- provar I1 ("no máximo uma a cada 72h") depois do fato.

create table if not exists public.mensagem_enviada (
  id                  uuid primary key default gen_random_uuid(),
  contato_id          uuid   not null references public.contatos(id)     on delete cascade,
  restaurante_id      bigint not null references public.restaurantes(id) on delete cascade,
  texto               text   not null,
  -- enviando: entregue ao n8n, aguardando callback
  -- enviado:  confirmado pelo provedor
  -- falhou:   o n8n reportou erro; os avisos voltaram para a fila
  -- simulado: dry-run — calculado e registrado, não enviado
  status              text   not null default 'enviando'
                        check (status in ('enviando', 'enviado', 'falhou', 'simulado')),
  provider_message_id text,
  erro_codigo         text,
  erro_mensagem       text,
  criado_em           timestamptz not null default now(),
  enviado_em          timestamptz
);

create index if not exists idx_mensagem_enviada_contato
  on public.mensagem_enviada (contato_id, criado_em desc);

create index if not exists idx_mensagem_enviada_restaurante
  on public.mensagem_enviada (restaurante_id, criado_em desc);

alter table public.mensagem_enviada enable row level security;

drop policy if exists tenant_isolation_select on public.mensagem_enviada;
create policy tenant_isolation_select on public.mensagem_enviada
  for select using (restaurante_id = public.get_user_restaurante_id());

alter table public.aviso_pendente
  drop constraint if exists aviso_pendente_mensagem_fk;
alter table public.aviso_pendente
  add constraint aviso_pendente_mensagem_fk
  foreign key (mensagem_id) references public.mensagem_enviada(id) on delete set null;

-- ---------------------------------------------------------------------------
-- O gancho: transição de status cria (ou cancela) avisos
-- ---------------------------------------------------------------------------

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

  -- Avanço: nasce um aviso por contato ligado à ação.
  --
  -- Só EM_ANDAMENTO e CONCLUIDO comunicam. SUGERIDA é proposta da IA que o dono
  -- ainda não aprovou — o cliente não deve sequer saber que existiu. E PENDENTE
  -- é o estado de partida: aprovar uma sugestão não é notícia para ninguém.
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

    -- DISTINCT porque a mesma pessoa pode ter mandado vários feedbacks que
    -- alimentaram esta ação: é UM aviso, não N (I4). O índice único é a
    -- garantia final; o distinct evita o conflito acontecer à toa.
    insert into public.aviso_pendente
      (contato_id, restaurante_id, acao_id, etapa, expira_em)
    select distinct
           fo.contato_id,
           new.restaurante_id,
           new.id,
           v_etapa,
           now() + make_interval(days => coalesce(v_expira_dias, 14))
      from public.feedback_acao fa
      join public.feedbacks_originais fo on fo.id = fa.feedback_original_id
      join public.contatos c            on c.id  = fo.contato_id
     where fa.acao_id = new.id
       and fo.contato_id is not null
       -- Opt-out: quem pediu para sair não entra na fila (SPEC, Parte E).
       and c.opt_out_em is null
    on conflict (contato_id, acao_id, etapa) do nothing;

  -- Regressão: a ação voltou atrás, então o que estava por comunicar deixa de
  -- ser verdade. Cancela só os avisos DESTA ação — as outras ações que
  -- compartilham o mesmo feedback seguem normalmente (SPEC, Parte E).
  else
    update public.aviso_pendente
       set status = 'cancelado'
     where acao_id = new.id
       and status  = 'na_fila';
  end if;

  return null;
end;
$fn$;

drop trigger if exists trg_acoes_processar_transicao on public.acoes_operacionais;
create trigger trg_acoes_processar_transicao
  after update of status on public.acoes_operacionais
  for each row
  execute function public.processar_transicao_acao();

-- Ação excluída: não há mais o que comunicar sobre ela. É BEFORE DELETE porque
-- o ON DELETE CASCADE de aviso_pendente apagaria as linhas antes de um AFTER
-- conseguir marcá-las — e queremos o rastro do cancelamento, não o sumiço.
create or replace function public.cancelar_avisos_acao_removida()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.aviso_pendente
     set status = 'cancelado'
   where acao_id = old.id
     and status  = 'na_fila';
  return old;
end;
$fn$;

drop trigger if exists trg_acoes_cancelar_avisos on public.acoes_operacionais;
create trigger trg_acoes_cancelar_avisos
  before delete on public.acoes_operacionais
  for each row
  execute function public.cancelar_avisos_acao_removida();
