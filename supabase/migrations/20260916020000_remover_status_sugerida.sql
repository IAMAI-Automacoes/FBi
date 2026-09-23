-- =============================================================================
-- Fim das ações SUGERIDA.
--
-- SUGERIDA era a ação que a IA propunha sozinha e ficava esperando o dono
-- aprovar. Hoje a ação só nasce quando o dono clica "Criar Ação" num insight, e
-- já nasce PENDENTE no quadro. O que sobrou do fluxo antigo:
--
-- - `trg_acoes_operacionais_sugestoes`: quando as SUGERIDA de um restaurante
--   acabavam, chamava `sugerir-acoes` sem insight, que convertia sozinha os 3
--   insights mais importantes em ações. Sai ANTES do delete abaixo — senão
--   apagar as sugeridas dispararia exatamente essa conversão.
-- - 12 ações SUGERIDA do Camelo (25/08), invisíveis no quadro, com vínculos a
--   feedbacks sem relação com elas. Os vínculos e o histórico caem em cascata;
--   os feedbacks presos a elas são liberados por `trg_acoes_liberar_feedbacks`.
-- - O valor no CHECK de status e em `ordem_status_acao`.
-- =============================================================================

drop trigger if exists trg_acoes_operacionais_sugestoes on public.acoes_operacionais;
drop function if exists public.trg_check_sugestoes_acoes();

delete from public.acoes_operacionais where status = 'SUGERIDA';

alter table public.acoes_operacionais
  drop constraint if exists acoes_operacionais_status_check;

-- Validado (o antigo era NOT VALID): depois do delete, toda linha já cumpre.
alter table public.acoes_operacionais
  add constraint acoes_operacionais_status_check
  check (status in ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'));

create or replace function public.ordem_status_acao(p_status text)
returns integer
language sql
immutable
as $function$
  select case p_status
           when 'PENDENTE' then 1
           when 'EM_ANDAMENTO' then 2
           when 'CONCLUIDO' then 3
           else -1 end;
$function$;
