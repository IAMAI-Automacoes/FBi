-- Estado de assinatura por restaurante.
--
-- Contexto: até aqui não existia nenhuma fonte de verdade sobre pagamento.
-- `é_pagante` e `ativo` eram nullable, sem default, e nenhum ponto do código
-- escrevia neles — conta criada sem pagar entrava no software normalmente.
--
-- Esta migration cria a coluna que o porteiro (RotaProtegida) vai ler e, no
-- mesmo movimento, impede que o próprio usuário a altere. As duas coisas
-- precisam entrar juntas: a policy de UPDATE de `restaurantes` permite que o
-- dono edite QUALQUER coluna da própria linha, então expor um campo de
-- assinatura sem proteção seria escalação de privilégio de uma requisição.
--
-- O Stripe não participa disso. Ele entra depois como mais um escritor da
-- mesma coluna; no MVP quem escreve é o admin da plataforma, pelo painel.

-- ─────────────────────────────────────────────────────────────
-- 1. Colunas
-- ─────────────────────────────────────────────────────────────

alter table public.restaurantes
  add column if not exists assinatura_status text not null default 'sem_assinatura',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plano_ciclo text,
  add column if not exists assinatura_expira_em timestamptz;

alter table public.restaurantes
  drop constraint if exists restaurantes_assinatura_status_check;

alter table public.restaurantes
  add constraint restaurantes_assinatura_status_check
  check (assinatura_status in ('sem_assinatura', 'ativa', 'inadimplente', 'cancelada'));

alter table public.restaurantes
  drop constraint if exists restaurantes_plano_ciclo_check;

alter table public.restaurantes
  add constraint restaurantes_plano_ciclo_check
  check (plano_ciclo is null or plano_ciclo in ('mensal', 'semestral', 'anual'));

-- O webhook do Stripe vai procurar a linha por estes campos.
create index if not exists idx_restaurantes_stripe_customer
  on public.restaurantes (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_restaurantes_stripe_subscription
  on public.restaurantes (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. Backfill — não trancar quem já é cliente
-- ─────────────────────────────────────────────────────────────
-- `é_pagante` é o único registro histórico de quem pagou. Vira o ponto de
-- partida e depois fica vestigial (nenhum ponto do app o lê).

update public.restaurantes
   set assinatura_status = 'ativa'
 where "é_pagante" is true
   and assinatura_status = 'sem_assinatura';

-- ─────────────────────────────────────────────────────────────
-- 3. Proteção contra auto-ativação
-- ─────────────────────────────────────────────────────────────
-- Escolhido trigger em vez de GRANT por coluna: o GRANT exigiria enumerar as
-- ~35 colunas legítimas e passaria a quebrar em silêncio toda vez que alguém
-- adicionasse coluna nova. O trigger cobre só os campos sensíveis e falha alto.

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
  -- Sem claims = acesso direto ao banco (migration, SQL editor, psql).
  -- Quem chega por aí já tem controle total; não há o que proteger.
  if claims is null or claims = '' then
    return new;
  end if;

  -- service_role: Edge Functions (o webhook do Stripe, quando existir).
  if papel = 'service_role' then
    return new;
  end if;

  -- Admin da plataforma liberando conta manualmente pelo painel.
  if exists (select 1 from public.platform_admins where email = auth.email()) then
    return new;
  end if;

  if new.assinatura_status     is distinct from old.assinatura_status
     or new.stripe_customer_id     is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.plano_ciclo            is distinct from old.plano_ciclo
     or new.assinatura_expira_em   is distinct from old.assinatura_expira_em
     or new."é_pagante"            is distinct from old."é_pagante"
     or new.ativo                  is distinct from old.ativo
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_colunas_assinatura on public.restaurantes;

create trigger trg_proteger_colunas_assinatura
  before update on public.restaurantes
  for each row execute function public.proteger_colunas_assinatura();

-- ─────────────────────────────────────────────────────────────
-- 4. Admin da plataforma precisa poder escrever
-- ─────────────────────────────────────────────────────────────
-- `platform_admins` tinha apenas policy de SELECT: o admin enxergava todas as
-- contas mas não conseguia alterar nenhuma. Sem isto, não há como liberar
-- cliente manualmente enquanto o pagamento automático não existe.

drop policy if exists admins_update_restaurantes on public.restaurantes;

create policy admins_update_restaurantes on public.restaurantes
  for update to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));
