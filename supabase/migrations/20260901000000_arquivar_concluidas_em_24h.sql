-- Ação que passa 24 h em CONCLUIDO sai do quadro sozinha.
--
-- O quadro é a lista do que ainda dá trabalho. Concluído fica visível pelo
-- tempo de alguém notar que terminou — e depois disso só ocupa a coluna, que
-- cresce para sempre porque nada a esvazia. Arquivar não apaga: a ação vai
-- para /acoes/arquivadas, com os mesmos dados, e pode voltar pelo botão de
-- desarquivar.

-- ── 1. Quando a ação foi concluída ───────────────────────────────────────────
-- Não dava para saber: `created_at` é do nascimento e `arquivada_em` só existe
-- depois de arquivar. Sem esta coluna, "24 h em concluído" não é calculável.
alter table public.acoes_operacionais
  add column if not exists concluida_em timestamptz;

comment on column public.acoes_operacionais.concluida_em is
  'Quando o status virou CONCLUIDO. Zerada se a ação voltar para outro status. '
  'É a base da contagem de 24 h para o arquivamento automático.';

-- ── 2. Preenchida pelo próprio banco ─────────────────────────────────────────
-- BEFORE UPDATE e não na aplicação: o status muda pelo arrastar do card, pelo
-- botão de avançar e por edge function. Regra de data que mora em três lugares
-- vira três datas diferentes.
create or replace function public.marcar_conclusao_acao()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'CONCLUIDO' and coalesce(old.status, '') <> 'CONCLUIDO' then
    new.concluida_em := now();
  elsif new.status <> 'CONCLUIDO' then
    -- Voltou para o quadro: o relógio zera. Sem isto, uma ação reaberta e
    -- concluída de novo carregaria a data da primeira vez e sumiria na hora.
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acoes_marcar_conclusao on public.acoes_operacionais;
create trigger trg_acoes_marcar_conclusao
  before update of status on public.acoes_operacionais
  for each row execute function public.marcar_conclusao_acao();

-- Carência para o que já está concluído hoje: `now()` em vez da data real de
-- conclusão (que não existe). Assim nada é arquivado em massa na primeira
-- passada do cron — quem já tinha ações concluídas vê o quadro do mesmo jeito
-- por mais 24 h.
update public.acoes_operacionais
   set concluida_em = now()
 where status = 'CONCLUIDO'
   and concluida_em is null
   and arquivada_em is null;

-- ── 3. O arquivamento ────────────────────────────────────────────────────────
create or replace function public.arquivar_concluidas_antigas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.acoes_operacionais
     set arquivada_em = now()
   where status = 'CONCLUIDO'
     and arquivada_em is null
     and concluida_em is not null
     and concluida_em < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.arquivar_concluidas_antigas() is
  'Move para o arquivo as ações concluídas há mais de 24 h. Roda de hora em '
  'hora pelo cron; devolve quantas moveu.';

-- De hora em hora, aos 25 minutos — longe dos outros jobs (:00, :05, :15, :20)
-- para não disputar conexão com eles.
select cron.unschedule('arquivar-concluidas')
 where exists (select 1 from cron.job where jobname = 'arquivar-concluidas');

select cron.schedule(
  'arquivar-concluidas',
  '25 * * * *',
  $$select public.arquivar_concluidas_antigas();$$
);
