-- Regra de bonificação da equipe (uma por restaurante, guardada como jsonb
-- igual ao padrão já usado em config_insights) + estado de pagamento por
-- garçom. periodo_inicio null = regra nunca foi salva/ativada ainda.
alter table public.restaurantes
  add column if not exists config_bonificacao jsonb not null default jsonb_build_object(
    'meta_escaneamentos', 50,
    'frequencia', 'mensal',
    'premio', '',
    'renovar_automatico', true,
    'periodo_inicio', null
  );

-- Timestamp do último "Pagar Bônus" clicado para aquele garçom. Comparado
-- com periodo_inicio da regra para saber se já foi pago NESTE período (fica
-- automaticamente "não pago" de novo quando o período renova, sem precisar
-- de um job para resetar).
alter table public.garcons
  add column if not exists bonus_pago_em timestamptz;
