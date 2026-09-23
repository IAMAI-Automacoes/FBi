-- Donos de restaurante não conseguiam salvar nada em `restaurantes`.
--
-- O trigger `proteger_colunas_assinatura` comparava, entre outras, as colunas
-- `é_pagante` e `ativo`, que não existem mais na tabela. Em PL/pgSQL, citar um
-- campo que NEW não tem é erro na hora de rodar — então todo update feito por
-- um dono comum (com JWT e sem ser admin) quebrava com
-- `record "new" has no field "é_pagante"`: salvar Configurações, o número dos
-- avisos urgentes, concluir o onboarding. Só o admin da plataforma passava,
-- porque o trigger libera o admin antes de chegar na comparação.
--
-- A lista volta a ter só colunas que existem, e recupera `excluida_em`, que a
-- migration da exclusão reversível protegia e uma versão posterior perdeu: o
-- dono não pode se "desexcluir" pela API.
create or replace function public.proteger_colunas_assinatura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claims text := current_setting('request.jwt.claims', true);
  papel  text := nullif(claims, '')::jsonb ->> 'role';
begin
  if claims is null or claims = '' then
    return new;
  end if;
  if papel = 'service_role' then
    return new;
  end if;
  if exists (select 1 from public.platform_admins where email = auth.email()) then
    return new;
  end if;

  if new.assinatura_status       is distinct from old.assinatura_status
     or new.stripe_customer_id      is distinct from old.stripe_customer_id
     or new.stripe_subscription_id  is distinct from old.stripe_subscription_id
     or new.plano_ciclo             is distinct from old.plano_ciclo
     or new.assinatura_expira_em    is distinct from old.assinatura_expira_em
     or new.assinatura_cancelada_em is distinct from old.assinatura_cancelada_em
     or new.excluida_em             is distinct from old.excluida_em
     or new.credito_ia_limite_usd   is distinct from old.credito_ia_limite_usd
     or new.credito_ia_ciclo_inicio is distinct from old.credito_ia_ciclo_inicio
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  return new;
end;
$function$;
