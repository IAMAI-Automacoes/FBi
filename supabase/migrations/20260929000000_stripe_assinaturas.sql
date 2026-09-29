-- Stripe: clientes, assinaturas, sessões de checkout e log de webhooks.
--
-- Contexto: `restaurantes` já tem as colunas que o porteiro (RotaProtegida) lê
-- (`assinatura_status`, `stripe_customer_id`, `stripe_subscription_id`,
-- `plano_ciclo`, `assinatura_expira_em`, `assinatura_cancelada_em`), protegidas
-- por trigger — só service_role/admin escrevem. Elas CONTINUAM sendo a
-- projeção que o app consome. O que entra aqui é o espelho fiel do Stripe, que
-- é a fonte da verdade, e a função que recalcula a projeção a partir dele.
--
-- Fluxo "paga primeiro, cria a conta depois": a assinatura nasce SEM
-- `restaurante_id` (não existe conta ainda). O vínculo só é gravado pela edge
-- function `vincular-compra`, depois de o servidor confirmar no Stripe que a
-- Checkout Session está paga e que o e-mail da conta é o e-mail do pagador.
-- Nada vindo do client decide o vínculo.
--
-- Nenhum valor monetário mora aqui: preço é lido do Stripe por lookup_key.

-- ─────────────────────────────────────────────────────────────
-- 1. Clientes Stripe
-- ─────────────────────────────────────────────────────────────
create table if not exists public.stripe_clientes (
  id                 uuid primary key default gen_random_uuid(),
  stripe_customer_id text not null unique,
  -- Nulo enquanto a conta não foi criada/vinculada. Único: um restaurante tem
  -- no máximo um Customer no Stripe.
  restaurante_id     bigint unique references public.restaurantes (id) on delete set null,
  email              text,
  nome               text,
  product_code       text not null default 'easyfeed',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_stripe_clientes_email
  on public.stripe_clientes (lower(email))
  where email is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. Assinaturas
-- ─────────────────────────────────────────────────────────────
create table if not exists public.stripe_assinaturas (
  id                     uuid primary key default gen_random_uuid(),
  stripe_subscription_id text not null unique,
  stripe_customer_id     text not null references public.stripe_clientes (stripe_customer_id) on delete cascade,
  restaurante_id         bigint references public.restaurantes (id) on delete set null,
  -- Status cru do Stripe: trialing | active | past_due | unpaid | canceled |
  -- incomplete | incomplete_expired | paused.
  status                 text not null,
  ciclo                  text check (ciclo is null or ciclo in ('mensal', 'semestral', 'anual')),
  -- Price atual (id e lookup_key no momento da última sincronização). O
  -- lookup_key migra para o price novo numa troca de preço, então quem ficou
  -- no price antigo (grandfathering) aparece aqui com lookup_key nulo.
  stripe_price_id        text,
  price_lookup_key       text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  ended_at               timestamptz,
  trial_end              timestamptz,
  -- Último invoice visto e seu estado, para a tela da conta e para os e-mails
  -- próprios (hosted_invoice_url vai no e-mail, nunca no banco em claro).
  ultimo_invoice_id      text,
  ultimo_invoice_status  text,
  product_code           text not null default 'easyfeed',
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_stripe_assinaturas_restaurante
  on public.stripe_assinaturas (restaurante_id)
  where restaurante_id is not null;

create index if not exists idx_stripe_assinaturas_customer
  on public.stripe_assinaturas (stripe_customer_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Sessões de Checkout (compras) — o elo entre pagamento e conta
-- ─────────────────────────────────────────────────────────────
create table if not exists public.stripe_checkout_sessions (
  id                        uuid primary key default gen_random_uuid(),
  stripe_session_id         text not null unique,
  stripe_customer_id        text,
  stripe_subscription_id    text,
  -- E-mail que o pagador digitou no Checkout (vem de customer_details.email).
  -- É contra ele que `vincular-compra` confere o e-mail da conta nova.
  email_pagador             text,
  ciclo                     text,
  -- Quem pediu a sessão: nulo na landing (ainda sem conta); preenchido quando
  -- foi um usuário logado sem plano (/assinatura). Neste segundo caso o webhook
  -- vincula sozinho — a origem é o JWT, não o client.
  restaurante_id_origem     bigint references public.restaurantes (id) on delete set null,
  -- Preenchido UMA vez, por `vincular-compra` ou pelo webhook. A troca
  -- `where restaurante_id_vinculado is null` é o que impede reutilizar o
  -- mesmo session_id em duas contas.
  restaurante_id_vinculado  bigint references public.restaurantes (id) on delete set null,
  vinculada_em              timestamptz,
  -- criada → paga → vinculada | expirada
  status                    text not null default 'criada'
                            check (status in ('criada', 'paga', 'vinculada', 'expirada')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_stripe_checkout_sessions_email
  on public.stripe_checkout_sessions (lower(email_pagador))
  where email_pagador is not null;

-- ─────────────────────────────────────────────────────────────
-- 4. Log de eventos de webhook (idempotência)
-- ─────────────────────────────────────────────────────────────
-- Só o id e o tipo: o payload inteiro carrega e-mail, nome e endereço do
-- cliente (LGPD) e já está no Stripe. Para investigar, o event_id abre o
-- evento no Dashboard.
create table if not exists public.stripe_eventos_webhook (
  event_id      text primary key,
  tipo          text not null,
  api_version   text,
  -- processando → ok | erro. Um evento em `erro` pode ser reprocessado no
  -- retry do Stripe; em `ok` é ignorado.
  status        text not null default 'processando'
                check (status in ('processando', 'ok', 'erro')),
  erro          text,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz
);

create index if not exists idx_stripe_eventos_webhook_recebido
  on public.stripe_eventos_webhook (recebido_em desc);

-- ─────────────────────────────────────────────────────────────
-- 5. updated_at automático
-- ─────────────────────────────────────────────────────────────
create or replace function public.stripe_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stripe_clientes_updated on public.stripe_clientes;
create trigger trg_stripe_clientes_updated
  before update on public.stripe_clientes
  for each row execute function public.stripe_touch_updated_at();

drop trigger if exists trg_stripe_assinaturas_updated on public.stripe_assinaturas;
create trigger trg_stripe_assinaturas_updated
  before update on public.stripe_assinaturas
  for each row execute function public.stripe_touch_updated_at();

drop trigger if exists trg_stripe_checkout_sessions_updated on public.stripe_checkout_sessions;
create trigger trg_stripe_checkout_sessions_updated
  before update on public.stripe_checkout_sessions
  for each row execute function public.stripe_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────
-- O dono lê o próprio cliente e as próprias assinaturas (tela "Minha conta").
-- Ninguém além de service_role escreve: o webhook e as edge functions usam a
-- chave de serviço, que ignora RLS. Sessões de checkout e log de webhook não
-- têm policy nenhuma: são internos.
alter table public.stripe_clientes           enable row level security;
alter table public.stripe_assinaturas        enable row level security;
alter table public.stripe_checkout_sessions  enable row level security;
alter table public.stripe_eventos_webhook    enable row level security;

drop policy if exists stripe_clientes_select_dono on public.stripe_clientes;
create policy stripe_clientes_select_dono on public.stripe_clientes
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists stripe_assinaturas_select_dono on public.stripe_assinaturas;
create policy stripe_assinaturas_select_dono on public.stripe_assinaturas
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id());

-- Admin da plataforma enxerga tudo (painel /admin).
drop policy if exists stripe_clientes_select_admin on public.stripe_clientes;
create policy stripe_clientes_select_admin on public.stripe_clientes
  for select to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()));

drop policy if exists stripe_assinaturas_select_admin on public.stripe_assinaturas;
create policy stripe_assinaturas_select_admin on public.stripe_assinaturas
  for select to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()));

-- ─────────────────────────────────────────────────────────────
-- 7. Projeção Stripe → restaurantes
-- ─────────────────────────────────────────────────────────────
-- Recalcula as colunas de assinatura de UM restaurante a partir do espelho.
-- Chamada pelo webhook depois de cada sincronização e por `vincular-compra`.
--
-- Por que uma função e não escrever direto: eventos chegam fora de ordem e um
-- restaurante pode ter mais de uma assinatura ao longo do tempo (cancelou,
-- voltou). Escolher "a que vale" num só lugar evita que um `deleted` atrasado
-- da assinatura antiga derrube a nova.
--
-- Mapeamento de status (Stripe → app):
--   trialing, active            → ativa
--   past_due, unpaid            → inadimplente  (Stripe ainda tenta cobrar)
--   canceled, incomplete_expired,
--   paused                      → cancelada
--   incomplete                  → (ignorada: pagamento inicial não concluiu)
create or replace function public.aplicar_assinatura_stripe(p_restaurante_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  novo_status text;
begin
  select *
    into a
    from public.stripe_assinaturas s
   where s.restaurante_id = p_restaurante_id
     and s.status <> 'incomplete'
   order by
     case s.status
       when 'active'    then 1
       when 'trialing'  then 2
       when 'past_due'  then 3
       when 'unpaid'    then 4
       else 9
     end,
     s.created_at desc
   limit 1;

  if a is null then
    -- Sem assinatura Stripe conhecida: não mexe (pode ser cupom/admin manual).
    return;
  end if;

  novo_status := case a.status
    when 'active'   then 'ativa'
    when 'trialing' then 'ativa'
    when 'past_due' then 'inadimplente'
    when 'unpaid'   then 'inadimplente'
    else 'cancelada'
  end;

  update public.restaurantes r
     set assinatura_status       = novo_status,
         stripe_customer_id      = a.stripe_customer_id,
         stripe_subscription_id  = a.stripe_subscription_id,
         plano_ciclo             = coalesce(a.ciclo, r.plano_ciclo),
         assinatura_expira_em    = coalesce(a.ended_at, a.current_period_end),
         assinatura_cancelada_em = case
                                     when a.cancel_at_period_end or a.status = 'canceled'
                                       then coalesce(a.canceled_at, r.assinatura_cancelada_em, now())
                                     else null
                                   end
   where r.id = p_restaurante_id;
end;
$$;

revoke all on function public.aplicar_assinatura_stripe(bigint) from public;
-- O webhook e `vincular-compra` chamam via RPC com a chave de serviço.
grant execute on function public.aplicar_assinatura_stripe(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 8. O cron de expiração não pode derrubar assinante do Stripe
-- ─────────────────────────────────────────────────────────────
-- `expirar_assinaturas()` cancela 'ativa' com `assinatura_expira_em < now()`.
-- No Stripe, a renovação acontece NO fim do período: o invoice nasce, a
-- cobrança roda até ~1h depois e só então chega `invoice.paid` empurrando a
-- data. Se o cron rodar nessa janela, cancela quem está pagando. Quem tem
-- `stripe_subscription_id` é regido pelo webhook; o cron só cuida do resto
-- (cupom de acesso, liberação manual do admin).
create or replace function public.expirar_assinaturas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and stripe_subscription_id is null
     and assinatura_expira_em is not null
     and assinatura_expira_em < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
