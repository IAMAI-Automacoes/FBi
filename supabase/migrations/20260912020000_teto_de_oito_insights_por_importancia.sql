-- Cada aba de importância passa a guardar no máximo 8 insights. Quando um novo
-- chega e a aba está cheia, o mais antigo sai — e os feedbacks dele voltam a
-- ficar LIVRES, disponíveis para virar insight de novo.
--
-- Por que um motivo de encerramento novo, e não o 'excluido' que já existe:
-- `liberar_pontos_insight_encerrado` trata os dois de formas opostas.
-- 'excluido' (a lixeira da tela) carimba `invalidado_em` nos feedbacks, que os
-- tira de circulação PARA SEMPRE — é o dono dizendo "isto aqui não me
-- interessa, não me traga de novo". Sair por excesso não quer dizer isso:
-- quer dizer que havia coisa mais recente na frente. Qualquer motivo que não
-- seja 'excluido' nem 'virou_acao' cai no ramo que devolve os pontos, então
-- 'excedente' já nasce com o comportamento certo.
--
-- Continua sendo encerramento por marca, não `delete`: a linha é a origem de
-- toda ação nascida dela (`acoes_operacionais.insight_id`), e apagá-la levaria
-- junto o registro de onde a ação veio.
alter table public.insights drop constraint if exists insights_motivo_encerramento_check;
alter table public.insights add constraint insights_motivo_encerramento_check
  check (motivo_encerramento = any (array['substituido','excluido','virou_acao','excedente']));

-- A mesma regra de aba que a tela usa (`abaDoInsight`, em Insights.tsx): tudo
-- que não é URGENTE nem IMPORTANTE é observação, inclusive prioridade nula.
-- Precisa ser igual, senão o teto de 8 cairia sobre um grupo diferente do que
-- a pessoa vê listado.
create or replace function public.aba_do_insight(p_prioridade text)
returns text
language sql
immutable
as $function$
  select case upper(btrim(coalesce(p_prioridade, '')))
           when 'URGENTE' then 'URGENTE'
           when 'IMPORTANTE' then 'IMPORTANTE'
           else 'OBSERVACAO'
         end
$function$;

create or replace function public.aparar_insights_da_aba()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aba text := public.aba_do_insight(new.prioridade);
begin
  -- Só apara quando o que entrou está de fato na tela.
  if not coalesce(new.ativo, false) or new.deletado_em is not null then
    return null;
  end if;

  update public.insights alvo
  set ativo = false,
      desativado_em = now(),
      deletado_em = now(),
      motivo_encerramento = 'excedente'
  where alvo.id in (
    select x.id
    from (
      select i.id,
             row_number() over (
               -- Fixados primeiro, para que nunca caiam na faixa de corte;
               -- depois os mais recentes. O `id` desempata para a ordem ser
               -- determinística quando dois nascem no mesmo instante — sem
               -- ele, duas execuções poderiam escolher vítimas diferentes.
               order by coalesce(i.fixado, false) desc, i.created_at desc, i.id desc
             ) as posicao
      from public.insights i
      where i.restaurante_id is not distinct from new.restaurante_id
        and public.aba_do_insight(i.prioridade) = v_aba
        and i.ativo
        and i.deletado_em is null
    ) x
    where x.posicao > 8
  )
  -- Rede dupla: fixar é o dono dizendo "mantenha isto à vista", e isso pesa
  -- mais que o teto. Se ele fixar mais de 8, a aba passa de 8 — escolha dele.
  and not coalesce(alvo.fixado, false);

  return null;
end;
$function$;

drop trigger if exists trg_insights_aparar_aba on public.insights;
create trigger trg_insights_aparar_aba
after insert on public.insights
for each row execute function public.aparar_insights_da_aba();
