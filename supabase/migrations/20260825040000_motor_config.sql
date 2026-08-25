-- Parâmetros do motor de resposta, por restaurante.
--
-- Sem tabela nova: reusa o jsonb `restaurantes.config_insights`, que já é o
-- lugar da configuração de IA deste projeto (feedbacks_por_analise,
-- horas_entre_analises, max_importantes...). Uma tabela só para 7 números
-- seria cerimônia sem retorno, e o padrão de leitura/escrita já existe no
-- frontend (src/pages/Insights.tsx:90-120, read-merge-write preservando as
-- outras chaves).
--
-- Quem edita o quê:
--   motor_resposta.*          -> só o admin da plataforma, em /admin.
--                                O dono NÃO ajusta o próprio cooldown: dono
--                                ansioso põe zero, volta o spam e o número
--                                dele é banido — exatamente o que o motor
--                                existe para evitar.
--   expiracao_feedback_dias   -> o dono, em /configuracoes. É escolha de
--                                negócio (por quanto tempo um feedback ainda
--                                merece virar insight), não parâmetro de
--                                operação.
--
-- Unidade do cooldown: DIAS, não horas. As 72h do SPEC viram 3 dias. A UI usa
-- min=1; o banco aceita 0 para permitir baixar o valor por SQL durante os
-- testes de aceitação sem ter que afrouxar constraint depois.

update public.restaurantes
set config_insights = coalesce(config_insights, '{}'::jsonb) || jsonb_build_object(
  'motor_resposta', coalesce(config_insights -> 'motor_resposta', '{}'::jsonb) || jsonb_build_object(
    -- Nasce DESLIGADO em todos. O go-live é ligar restaurante por restaurante,
    -- não aplicar uma migration.
    'ativo',             coalesce(config_insights -> 'motor_resposta' -> 'ativo',             'false'::jsonb),
    'cooldown_dias',     coalesce(config_insights -> 'motor_resposta' -> 'cooldown_dias',     '3'::jsonb),
    'agregacao_min',     coalesce(config_insights -> 'motor_resposta' -> 'agregacao_min',     '30'::jsonb),
    'max_itens_msg',     coalesce(config_insights -> 'motor_resposta' -> 'max_itens_msg',     '4'::jsonb),
    'quiet_inicio',      coalesce(config_insights -> 'motor_resposta' -> 'quiet_inicio',      '22'::jsonb),
    'quiet_fim',         coalesce(config_insights -> 'motor_resposta' -> 'quiet_fim',         '9'::jsonb),
    'expira_aviso_dias', coalesce(config_insights -> 'motor_resposta' -> 'expira_aviso_dias', '14'::jsonb)
  ),
  'expiracao_feedback_dias',
    coalesce(config_insights -> 'expiracao_feedback_dias', '14'::jsonb)
);

-- Restaurantes criados depois desta migration precisam nascer com os mesmos
-- padrões, senão o worker cairia no fallback do código para cada leitura.
create or replace function public.aplicar_config_motor_padrao()
returns trigger
language plpgsql
as $fn$
begin
  new.config_insights := coalesce(new.config_insights, '{}'::jsonb) || jsonb_build_object(
    'motor_resposta',
      coalesce(new.config_insights -> 'motor_resposta', '{}'::jsonb) || jsonb_build_object(
        'ativo',             coalesce(new.config_insights -> 'motor_resposta' -> 'ativo',             'false'::jsonb),
        'cooldown_dias',     coalesce(new.config_insights -> 'motor_resposta' -> 'cooldown_dias',     '3'::jsonb),
        'agregacao_min',     coalesce(new.config_insights -> 'motor_resposta' -> 'agregacao_min',     '30'::jsonb),
        'max_itens_msg',     coalesce(new.config_insights -> 'motor_resposta' -> 'max_itens_msg',     '4'::jsonb),
        'quiet_inicio',      coalesce(new.config_insights -> 'motor_resposta' -> 'quiet_inicio',      '22'::jsonb),
        'quiet_fim',         coalesce(new.config_insights -> 'motor_resposta' -> 'quiet_fim',         '9'::jsonb),
        'expira_aviso_dias', coalesce(new.config_insights -> 'motor_resposta' -> 'expira_aviso_dias', '14'::jsonb)
      ),
    'expiracao_feedback_dias',
      coalesce(new.config_insights -> 'expiracao_feedback_dias', '14'::jsonb)
  );
  return new;
end;
$fn$;

drop trigger if exists trg_restaurantes_config_motor on public.restaurantes;
create trigger trg_restaurantes_config_motor
  before insert on public.restaurantes
  for each row
  execute function public.aplicar_config_motor_padrao();
