-- Exclusão reversível de contas.
--
-- Apagar de verdade não serve: metade das tabelas filhas de `restaurantes` tem
-- FK sem CASCADE, então a exclusão falharia em qualquer conta com dados — e
-- quando funcionasse, destruiria feedbacks e relatórios sem volta.
-- `excluida_em` nulo = conta ativa.

alter table public.restaurantes
  add column if not exists excluida_em timestamptz;

-- Entra na mesma proteção das colunas de assinatura: o próprio usuário não
-- pode se "desexcluir", só admin da plataforma ou service_role.
create or replace function public.proteger_colunas_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if new.assinatura_status     is distinct from old.assinatura_status
     or new.stripe_customer_id     is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.plano_ciclo            is distinct from old.plano_ciclo
     or new.assinatura_expira_em   is distinct from old.assinatura_expira_em
     or new.excluida_em            is distinct from old.excluida_em
     or new."é_pagante"            is distinct from old."é_pagante"
     or new.ativo                  is distinct from old.ativo
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  return new;
end;
$$;
