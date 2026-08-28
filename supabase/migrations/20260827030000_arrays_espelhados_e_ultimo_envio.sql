-- F1: arrays espelhados de vínculo, e a data do último envio no contato.
--
-- ## Por que espelhar em array se a tabela de junção já existe
--
-- `insight_feedback` e `feedback_acao` continuam sendo a FONTE DA VERDADE: elas
-- têm chave estrangeira, índice, e não sofrem corrida quando dois processos
-- escrevem ao mesmo tempo (um array precisaria de read-modify-write, e o último
-- a gravar apagaria o trabalho do outro).
--
-- O array existe para quem lê de FORA — o n8n, que precisa dos ids de um insight
-- ou de uma ação numa consulta só, sem saber fazer join no PostgREST.
--
-- Espelho, nunca escrito à mão: quem mantém é o trigger. É a lição do contador
-- `feedbacks_relacionados`, que era atualizado por UPDATE dentro de cada edge
-- function e ficou marcando 7 com 5 pontos reais assim que um feedback foi
-- apagado e o `on delete cascade` derrubou a linha de vínculo sem avisar
-- ninguém (medido em 2026-08-27).
--
-- Por isso os dois triggers cobrem INSERT **e** DELETE.

-- ---------------------------------------------------------------------------
-- Colunas
-- ---------------------------------------------------------------------------
alter table public.insights
  add column if not exists pontos_ids bigint[] not null default '{}';

alter table public.acoes_operacionais
  add column if not exists pontos_ids bigint[] not null default '{}',
  add column if not exists originais_ids uuid[] not null default '{}';

comment on column public.insights.pontos_ids is
  'Espelho de insight_feedback, mantido por trigger. NAO escrever a mao.';
comment on column public.acoes_operacionais.pontos_ids is
  'Espelho de feedback_acao (pontos), mantido por trigger. NAO escrever a mao.';
comment on column public.acoes_operacionais.originais_ids is
  'Espelho de feedback_acao (mensagens originais), mantido por trigger.';

-- ---------------------------------------------------------------------------
-- Insight: estende a funcao que ja recalculava o contador
-- ---------------------------------------------------------------------------
-- Estender em vez de criar um segundo trigger: os dois disparariam no mesmo
-- evento, fariam dois UPDATE na mesma linha de `insights` e a ordem entre eles
-- nao e garantida.
create or replace function public.sincronizar_contador_insight()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_insight uuid;
begin
  -- No DELETE o `new` nao existe; no INSERT o `old` nao existe.
  v_insight := coalesce(new.insight_id, old.insight_id);

  update public.insights i
     set feedbacks_relacionados = c.total,
         pontos_ids             = c.pontos,
         feedback_ids           = c.originais
    from (
      select count(*)                                          as total,
             coalesce(array_agg(vi.feedback_restaurante_id
                                order by vi.feedback_restaurante_id), '{}') as pontos,
             coalesce(array_agg(distinct vi.feedback_original_id)
                        filter (where vi.feedback_original_id is not null), '{}') as originais
        from public.insight_feedback vi
       where vi.insight_id = v_insight
    ) c
   where i.id = v_insight;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acao: funcao propria
-- ---------------------------------------------------------------------------
-- Aqui NAO da para estender a existente: `marcar_feedback_usado_por_vinculo` e
-- AFTER INSERT e trata do cache de uso, com um ramo para linhas legadas sem
-- ponto. Misturar as duas responsabilidades numa funcao so tornaria as duas
-- mais dificeis de mudar.
create or replace function public.sincronizar_arrays_acao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_acao bigint;
begin
  v_acao := coalesce(new.acao_id, old.acao_id);

  -- Numa cascade (delete da acao derruba feedback_acao), este UPDATE nao acha
  -- a linha e afeta zero registros. Isso e correto e nao e erro.
  update public.acoes_operacionais a
     set pontos_ids    = c.pontos,
         originais_ids = c.originais
    from (
      select coalesce(array_agg(fa.feedback_restaurante_id
                                order by fa.feedback_restaurante_id)
                        filter (where fa.feedback_restaurante_id is not null), '{}') as pontos,
             coalesce(array_agg(distinct fa.feedback_original_id)
                        filter (where fa.feedback_original_id is not null), '{}') as originais
        from public.feedback_acao fa
       where fa.acao_id = v_acao
    ) c
   where a.id = v_acao;

  return null;
end;
$$;

drop trigger if exists trg_feedback_acao_arrays on public.feedback_acao;
create trigger trg_feedback_acao_arrays
after insert or delete on public.feedback_acao
for each row execute function public.sincronizar_arrays_acao();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
update public.insights i
   set feedbacks_relacionados = c.total,
       pontos_ids             = c.pontos,
       feedback_ids           = c.originais
  from (
    select vi.insight_id,
           count(*)                                          as total,
           coalesce(array_agg(vi.feedback_restaurante_id
                              order by vi.feedback_restaurante_id), '{}') as pontos,
           coalesce(array_agg(distinct vi.feedback_original_id)
                      filter (where vi.feedback_original_id is not null), '{}') as originais
      from public.insight_feedback vi
     group by vi.insight_id
  ) c
 where c.insight_id = i.id;

update public.acoes_operacionais a
   set pontos_ids    = c.pontos,
       originais_ids = c.originais
  from (
    select fa.acao_id,
           coalesce(array_agg(fa.feedback_restaurante_id
                              order by fa.feedback_restaurante_id)
                      filter (where fa.feedback_restaurante_id is not null), '{}') as pontos,
           coalesce(array_agg(distinct fa.feedback_original_id)
                      filter (where fa.feedback_original_id is not null), '{}') as originais
      from public.feedback_acao fa
     group by fa.acao_id
  ) c
 where c.acao_id = a.id;

-- ---------------------------------------------------------------------------
-- Data do ultimo envio, na tabela dos clientes
-- ---------------------------------------------------------------------------
-- A carencia entre mensagens deixa de morar em `janela_contato` (tabela do motor
-- antigo, hoje vazia) e passa para o proprio contato: e o n8n que vai ler e
-- escrever esta coluna, e ele nao deve precisar conhecer as tabelas internas do
-- motor para saber se ja falou com alguem.
alter table public.contatos
  add column if not exists ultimo_envio_em timestamptz;

comment on column public.contatos.ultimo_envio_em is
  'Quando o cliente recebeu a ultima mensagem de retorno. Escrita pelo n8n apos o envio confirmado; e o relogio da carencia de cooldown_dias.';

create index if not exists contatos_ultimo_envio_idx
  on public.contatos (restaurante_id, ultimo_envio_em);
