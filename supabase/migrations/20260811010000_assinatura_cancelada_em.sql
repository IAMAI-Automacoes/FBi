-- Marca quando o usuário pediu o cancelamento. Se a assinatura ainda tem data
-- futura, ele mantém acesso até lá (o job de expiração encerra na data); se não
-- tem data (infinita), a edge function `cancelar-assinatura` encerra na hora.
alter table public.restaurantes
  add column if not exists assinatura_cancelada_em timestamptz;

-- O dono não pode mexer nesse campo (só servidor/admin). Recria o trigger de
-- proteção incluindo a coluna nova.
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

  if new.assinatura_status       is distinct from old.assinatura_status
     or new.stripe_customer_id      is distinct from old.stripe_customer_id
     or new.stripe_subscription_id  is distinct from old.stripe_subscription_id
     or new.plano_ciclo             is distinct from old.plano_ciclo
     or new.assinatura_expira_em    is distinct from old.assinatura_expira_em
     or new.assinatura_cancelada_em is distinct from old.assinatura_cancelada_em
     or new."é_pagante"             is distinct from old."é_pagante"
     or new.ativo                   is distinct from old.ativo
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  return new;
end;
$$;
