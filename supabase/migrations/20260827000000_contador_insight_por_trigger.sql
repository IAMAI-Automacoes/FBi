-- Contador de pontos do insight mantido por trigger, e a RPC de geração salva
-- em arquivo.
--
-- ## O contador
--
-- `insights.feedbacks_relacionados` vinha sendo atualizado por UPDATE manual em
-- cada função que cria vínculo (gerar-insights, vincular-feedback). Isso deixa
-- de fora todo caminho que NÃO passa por essas funções — em particular o
-- `on delete cascade` de `insight_feedback`: apagar um feedback derruba a linha
-- de vínculo e o contador fica alto para sempre.
--
-- Aconteceu de verdade, medido em 2026-08-27: um insight ficou marcando 7 com 5
-- pontos reais depois que dois feedbacks de teste foram removidos.
--
-- A correção é a mesma lição do resto desta reforma: uma fonte só. O contador
-- passa a ser derivado de `insight_feedback` por trigger, e as funções param de
-- precisar lembrar de atualizá-lo.
--
-- O front já lê `insight_feedback(count)` direto (a contagem da telinha e a do
-- card saem da mesma consulta), então esta coluna é legado — mas número errado
-- guardado no banco vira o próximo bug de alguém.

create or replace function public.sincronizar_contador_insight()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_insight uuid;
begin
  -- No DELETE o `new` não existe; no INSERT o `old` não existe.
  v_insight := coalesce(new.insight_id, old.insight_id);

  update public.insights i
     set feedbacks_relacionados = (
           select count(*) from public.insight_feedback vi
            where vi.insight_id = v_insight)
   where i.id = v_insight;

  return null;
end;
$$;

-- AFTER, e não BEFORE: a contagem tem que enxergar a linha já inserida (ou já
-- removida). Em BEFORE ela leria o estado anterior e erraria por um.
drop trigger if exists trg_insight_feedback_contador on public.insight_feedback;
create trigger trg_insight_feedback_contador
after insert or delete on public.insight_feedback
for each row execute function public.sincronizar_contador_insight();

-- Acerta o que já está torto.
update public.insights i
   set feedbacks_relacionados = (
         select count(*) from public.insight_feedback vi
          where vi.insight_id = i.id)
 where i.feedbacks_relacionados is distinct from (
         select count(*) from public.insight_feedback vi
          where vi.insight_id = i.id);

-- ---------------------------------------------------------------------------
-- `feedbacks_para_geracao` — aplicada direto no banco em 2026-08-26, sem passar
-- por arquivo. Registrada aqui para o histórico de migrations bater com o banco.
--
-- Existe para que `gerar-insights` possa ver o que TERIA para trabalhar antes de
-- desativar qualquer coisa. A ordem antiga (desativa os insights → busca os
-- livres → gera) perdeu 4 insights quando a edge function estourou o limite de
-- 150s no meio: o processo foi morto, o catch de rollback nunca rodou.
--
-- Um insight FIXADO segura seus pontos; um insight comum não, porque ele vai ser
-- substituído nesta mesma rodada.
-- ---------------------------------------------------------------------------
create or replace function public.feedbacks_para_geracao(
  p_restaurante_id bigint,
  p_dias integer default 14
)
returns setof public.feedbacks_restaurante
language sql
stable
security definer
set search_path to 'public'
as $$
  select fr.*
  from public.feedbacks_restaurante fr
  where fr.restaurante_id = p_restaurante_id
    and fr.created_at >= now() - make_interval(days => p_dias)
    -- Ação existente segura o ponto sempre, inclusive arquivada.
    and not exists (
      select 1 from public.feedback_acao fa
      where fa.feedback_restaurante_id = fr.id
         or (fa.feedback_restaurante_id is null
             and fa.feedback_original_id = fr.origem_id))
    -- Insight vivo segura só se estiver FIXADO.
    and not exists (
      select 1 from public.insight_feedback vi
      join public.insights i on i.id = vi.insight_id
      where vi.feedback_restaurante_id = fr.id
        and i.ativo
        and i.deletado_em is null
        and coalesce(i.fixado, false) = true)
$$;
